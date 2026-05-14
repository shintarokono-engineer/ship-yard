import { Injectable, Logger } from '@nestjs/common';

import { Feature } from '@shipyard/db';

import { PrismaService } from '../prisma/prisma.service';
import { AIUsageService } from './ai-usage.service';
import { OpenAIService } from './openai.service';

/**
 * ProjectDocument の `embedding` カラム(`vector(1536)`)を OpenAI text-embedding-3-small で埋めるサービス(ADR-005)。
 *
 * **責務**:
 * - 1 件: `upsertForDocument` … 新規/編集された ProjectDocument に対して、`title + content` を埋め込んで UPDATE
 * - 一括: `backfillForTenant` … `embedding IS NULL` の行をテナント単位でまとめて埋める(CLI スクリプト用)
 *
 * **失敗時のポリシー**:
 * - OpenAI API 失敗は **握りつぶしてログ出力**(呼び出し元の AI 生成は成功扱い)。後で `backfillForTenant` で取り戻す。
 *
 * **マルチテナント**:
 * - `UPDATE` の `WHERE` 句に `tenantId` を必ず含める(ADR-002 / ESLint `no-raw-sql-without-tenant-filter`)。
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAIService,
    private readonly aiUsage: AIUsageService,
  ) {}

  /**
   * 指定 ProjectDocument の embedding を `title + content` で計算して `UPDATE`。
   * テナント外 / 不存在は 0 行 UPDATE で静かに終わる。失敗は握りつぶし(呼び出し元の主処理を守る)。
   *
   * @returns 埋め込みが成功したら `true`、何らかの理由でスキップ/失敗したら `false`(呼び出し元はこの戻り値で挙動を変えなくてよい)
   */
  async upsertForDocument(params: {
    tenantId: string;
    userId: string;
    documentId: string;
    title: string;
    content: string;
  }): Promise<boolean> {
    const text = `${params.title}\n\n${params.content}`.trim();
    if (!text) return false;
    try {
      const result = await this.openai.embedText(text);
      // pgvector に渡すリテラル形式 `[0.1, 0.2, ...]` の文字列。Prisma がパラメータ値として埋め込む。
      const vectorLiteral = `[${result.vector.join(',')}]`;

      // raw SQL で UPDATE。tenantId フィルタ必須(ESLint no-raw-sql-without-tenant-filter / ADR-002)。
      // `Unsupported("vector(1536)")?` は Prisma Client から書き込めないため、`::vector` キャスト経由で更新する。
      const affected = await this.prisma.$executeRaw`
        UPDATE "ProjectDocument"
        SET "embedding" = ${vectorLiteral}::vector
        WHERE "id" = ${params.documentId} AND "tenantId" = ${params.tenantId}
      `;

      if (affected === 0) {
        // 該当 0 行(削除済み等)。エラーではないがログだけ残す。
        this.logger.warn(
          `embedding UPDATE affected 0 rows for documentId=${params.documentId} (already deleted or wrong tenant)`,
        );
        return false;
      }

      // 利用記録(課金根拠)。tokensOut は embedding には無い(0 で記録)。
      await this.aiUsage.record({
        tenantId: params.tenantId,
        userId: params.userId,
        model: result.model,
        feature: Feature.OTHER,
        tokensIn: result.tokensIn,
        tokensOut: 0,
      });
      return true;
    } catch (e) {
      // OpenAI 障害 / レート制限 / ネットワーク不通 等で失敗しても、AI 生成自体は成功扱いにする。
      // 後で `backfillForTenant` で `embedding IS NULL` の行をまとめて埋め直す。
      this.logger.error(
        `embedding failed for documentId=${params.documentId} (will be backfilled later)`,
        e instanceof Error ? e.stack : String(e),
      );
      return false;
    }
  }

  /**
   * テナント内の `embedding IS NULL`(かつ未削除)な ProjectDocument を一括で埋める(CLI バックフィル用)。
   *
   * **用途**:
   * 通常経路(`upsertForDocument`)の自動 hook で取りこぼした行を後追いで埋め直す保険。
   * 「失敗握りつぶし」ポリシーと対になって完全性を担保する(片方だけだと NULL 行が放置される)。
   * 機能追加前の既存データ / 外部 API 障害時の取りこぼし / モデル変更後の再生成、いずれもこの 1 メソッドで回収。
   *
   * **対象**:
   * `embedding IS NULL` の行のみ。既に埋まっている行は SELECT の WHERE で除外するためスキップされ、
   * 何度叩いても安全(冪等)。失敗した分だけ次回以降に再試行される(OpenAI コストも最小限)。
   *
   * **実装メモ**:
   * - 1 行ずつ順次処理(レート制限を避けるため batch 並列にしない、MVP 方針)
   * - `embedding` は Prisma の `Unsupported` 型のため通常の `where` で `IS NULL` を表現できない。
   *   SELECT も raw SQL を使う(tenantId フィルタ込み、ESLint ルール準拠)
   *
   * @returns `{ processed: 試行件数, succeeded: 成功件数 }`
   */
  async backfillForTenant(tenantId: string, fallbackUserId: string) {
    const targets = await this.prisma.$queryRaw<
      Array<{ id: string; title: string; content: string; createdById: string }>
    >`
      SELECT "id", "title", "content", "createdById"
      FROM "ProjectDocument"
      WHERE "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
        AND "embedding" IS NULL
      ORDER BY "createdAt" ASC
    `;

    let succeeded = 0;
    for (const doc of targets) {
      const ok = await this.upsertForDocument({
        tenantId,
        userId: doc.createdById ?? fallbackUserId,
        documentId: doc.id,
        title: doc.title,
        content: doc.content,
      });
      if (ok) succeeded++;
    }
    return { processed: targets.length, succeeded };
  }
}
