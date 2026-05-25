import { Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';

import { type ServiceScore } from '@shipyard/db';

import { PrismaService } from '../prisma/prisma.service';
import type { DiagnosisOutput } from './diagnosis-types';

/**
 * プロダクト診断(PRODUCT_DIAGNOSIS、ADR-013)の Service。
 *
 * Day 43 ではデータアクセス + 骨組みのみ実装。Sonnet 4 + Web Search Tool + Tool Use の
 * 実呼び出しは Day 44 で `runDiagnosis()` の本実装として追加する。本日は API 形状の確定と
 * 履歴取得・単件取得のクエリのみ動作する状態にする。
 *
 * `/workspaces/:slug/...` ルートは ALS のテナントコンテキストを持たないため、`tenantId` は
 * 引数で受け取り全クエリに明示注入する(implementation-rules.md「テナント解決」)。
 */
@Injectable()
export class ProductDiagnosisService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * テナント + プロジェクトに紐づく診断履歴を新しい順で取得する。
   *
   * Day 45-46 の FE 履歴一覧画面で使用。ページングは MVP では未実装(最新 N 件で十分)。
   */
  async getHistory(tenantId: string, projectId: string): Promise<ServiceScore[]> {
    return this.prisma.serviceScore.findMany({
      where: { tenantId, projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 特定の診断結果を ID で取得する。
   *
   * `tenantId` フィルタでテナント越境を防ぐ。不在 / 他テナントは 404 として返し、存在の
   * 有無を漏らさない(ADR-003 と同方針)。
   */
  async getById(tenantId: string, id: string): Promise<ServiceScore> {
    const score = await this.prisma.serviceScore.findFirst({
      where: { id, tenantId },
    });
    if (!score) {
      throw new NotFoundException('指定された診断結果は存在しません。');
    }
    return score;
  }

  /**
   * 新規診断を実行する(Day 44 で完成予定)。
   *
   * 実装予定の処理フロー:
   *   1. `AIUsageService.assertWithinDiagnosisQuota({ tenantId, plan })` で Free フォールバック 403 + Pro/Team 月次上限チェック
   *   2. Project + 関連データ(ProjectDocument / ChecklistItem 進捗 / LandingPage)を gatherContext
   *   3. system prompt 構築:`AI_PERSONA_INTRO` + `formatRubricForPrompt()`(`diagnosis.constants` から)+
   *      「厳しく採点せよ。15 点以上は明確な強みがある場合のみ」 等の LLM スコア限界対策(ADR-013)
   *   4. Sonnet 4 + Anthropic server-side Web Search Tool(正式 type 名は Day 44 で公式ドキュメント確認 →
   *      `ai.constants.ts` に集約)+ Tool Use(`submit_service_score` を `tool_choice` で強制)+
   *      `temperature=PRODUCT_DIAGNOSIS_TEMPERATURE`(0.2)+ `max_tokens=PRODUCT_DIAGNOSIS_MAX_TOKENS`(4096)で呼び出し
   *   5. `parseDiagnosisOutput`(diagnosis-schema.ts)で整合性検証(totalScore === sum of breakdown.score、
   *      `competitorRefs.url` の `isSafeHttpUrl` 検証込み、不一致 / 不正は AIBadResponseError 502)
   *   6. `ServiceScore` INSERT + `AIUsage` 記録(Feature.PRODUCT_DIAGNOSIS、トランザクション内で同時、
   *      Web Search のトークンは Feature.OTHER で別途 record)
   *   7. 結果を返す
   *
   * Day 43 時点では呼び出されたら 501 を返す(骨組み確認用)。
   */
  async runDiagnosis(_input: {
    tenantId: string;
    projectId: string;
    userId: string;
    plan: string;
    instructions?: string;
  }): Promise<{ score: ServiceScore; output: DiagnosisOutput }> {
    throw new NotImplementedException(
      'PRODUCT_DIAGNOSIS の実呼び出しは Day 44 で実装されます(ADR-013)。',
    );
  }
}
