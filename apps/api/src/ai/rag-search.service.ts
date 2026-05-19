import { Injectable, Logger } from '@nestjs/common';

import { DocType, Prisma } from '@shipyard/db';

import { PrismaService } from '../prisma/prisma.service';
import {
  EMBEDDING_MODEL,
  RAG_CONTENT_TRUNCATE_CHARS,
  RAG_TOP_K,
  SEED_PUBLIC_TENANT_ID,
} from './ai.constants';
import type { RagReference } from './format-reference';
import { OpenAIService } from './openai.service';

/**
 * RAG 検索のヒット 1 件。本文は prompt 注入用に切り詰め済み。
 * `RagReference` を継承するため、結果配列(`RagSearchResult.hits`)をそのまま
 * `formatReferenceSection` の `references` に渡せる(マッピング不要)。
 */
export interface RagSearchHit extends RagReference {
  id: string;
  projectId: string;
  type: DocType;
  /** pgvector の `<=>` が返す cosine distance(0=完全一致, 2=逆向き)。デバッグ / ログ用。 */
  distance: number;
  /**
   * このヒットが運営キュレーション seed コーパス(`SEED_PUBLIC` テナント、ADR-008)由来か。
   * フロント側で「サンプルテンプレートを参考にしています」 と表示する透明性 + LP メッセージング用。
   */
  isSeed: boolean;
}

/** RAG 検索の結果 + クエリ embed のコスト記録(AIUsage 用)。 */
export interface RagSearchResult {
  hits: RagSearchHit[];
  tokensIn: number;
  model: string;
}

/**
 * テナント内の `ProjectDocument` を意味検索するサービス(ADR-005 の独自性コア、ADR-008 で seed テナント横断に拡張)。
 *
 * クエリテキストを `text-embedding-3-small` で埋め込み、pgvector の `<=>`(cosine distance)で
 * 上位 N 件を取得する。`embedding` は `Unsupported("vector(1536)")?` のため Prisma の typed クエリでは
 * 扱えず、raw SQL を使う(ESLint `no-raw-sql-without-tenant-filter` 準拠で `tenantId` フィルタ必須)。
 *
 * **検索範囲(ADR-008)**:
 * - 既定 (`includeSeed: true`):「呼び出し元テナント + `SEED_PUBLIC` テナント(運営キュレーション seed コーパス)」 を OR で対象
 * - `includeSeed: false`:従来通り 呼び出し元テナントのみ(seed を混ぜたくない用途、例:同テナント内の自己検索)
 *
 * ヒット 0 件は呼び出し側で「cold start」として無視できるよう空配列を返す(例外にしない)。
 */
@Injectable()
export class RagSearchService {
  private readonly logger = new Logger(RagSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAIService,
  ) {}

  /**
   * 意味検索を実行。`query` をベクトル化して類似ドキュメント上位 N 件を返す。
   *
   * @param tenantId 検索対象テナント(マルチテナント分離、必須)
   * @param query 検索クエリ(プロジェクト名+概要+追加指示などを結合した文字列)
   * @param options.topK 取得件数(既定: `RAG_TOP_K`)
   * @param options.excludeProjectId 自分自身のドキュメントを参考にしないため除外する projectId
   * @param options.includeSeed 運営キュレーション seed コーパス(`SEED_PUBLIC`)も検索対象に含めるか(既定 `true`、ADR-008)
   */
  async searchSimilar(
    tenantId: string,
    query: string,
    options: { topK?: number; excludeProjectId?: string; includeSeed?: boolean } = {},
  ): Promise<RagSearchResult> {
    const text = query.trim();
    const topK = options.topK ?? RAG_TOP_K;
    const includeSeed = options.includeSeed ?? true;
    if (!text) {
      return { hits: [], tokensIn: 0, model: EMBEDDING_MODEL };
    }

    // OpenAI 障害(レート制限 / ネットワーク不通 等)で RAG 検索が落ちても、上位の AI 生成は止めない方針
    // (EmbeddingService.upsertForDocument と一貫した「主処理を守る」ポリシー)。
    // 空ヒットを返せば呼び出し側は cold start と同じ挙動になる(参考なしで生成)。
    let embed;
    try {
      embed = await this.openai.embedText(text);
    } catch (e) {
      this.logger.warn(
        `RAG search failed (will fall back to no-context generation): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return { hits: [], tokensIn: 0, model: EMBEDDING_MODEL };
    }
    const vectorLiteral = `[${embed.vector.join(',')}]`;

    // excludeProjectId がある場合のみフラグメントを足す(動的 SQL 組み立て、Prisma.sql で安全に補間)
    const excludeFragment = options.excludeProjectId
      ? Prisma.sql`AND "projectId" != ${options.excludeProjectId}`
      : Prisma.empty;

    // tenantId フィルタ(ESLint `no-raw-sql-without-tenant-filter` 準拠で `tenantId` をクエリ内に含める)。
    // ADR-008 の例外:`includeSeed=true` なら `SEED_PUBLIC` テナントも対象。それ以外の業務テーブル
    // (Project / ChecklistItem 等)は依然として完全分離、ベクトル検索のみ横断を許可。
    const tenantFragment =
      includeSeed && tenantId !== SEED_PUBLIC_TENANT_ID
        ? Prisma.sql`"tenantId" IN (${tenantId}, ${SEED_PUBLIC_TENANT_ID})`
        : Prisma.sql`"tenantId" = ${tenantId}`;

    // `embedding <=> ${vec}::vector` で cosine distance、ASC で類似順。`embedding IS NOT NULL` で未 embed を除外。
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        tenantId: string;
        projectId: string;
        type: DocType;
        title: string;
        content: string;
        distance: number;
      }>
    >`
      SELECT
        "id",
        "tenantId",
        "projectId",
        "type",
        "title",
        "content",
        "embedding" <=> ${vectorLiteral}::vector AS "distance"
      FROM "ProjectDocument"
      WHERE ${tenantFragment}
        AND "deletedAt" IS NULL
        AND "embedding" IS NOT NULL
        ${excludeFragment}
      ORDER BY "embedding" <=> ${vectorLiteral}::vector ASC
      LIMIT ${topK}
    `;

    const hits: RagSearchHit[] = rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      type: row.type,
      title: row.title,
      content: truncateContent(row.content, RAG_CONTENT_TRUNCATE_CHARS),
      // PostgreSQL の数値が string で返るケースに備えて Number 化
      distance: Number(row.distance),
      isSeed: row.tenantId === SEED_PUBLIC_TENANT_ID,
    }));

    if (hits.length === 0) {
      this.logger.debug(`RAG search: no hits for tenant=${tenantId} (cold start or all filtered)`);
    }

    return { hits, tokensIn: embed.tokensIn, model: embed.model };
  }
}

/** 本文を指定文字数で切り詰める。超過時は末尾に「…」を付ける(prompt 注入時の視認性のため)。 */
function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}…`;
}
