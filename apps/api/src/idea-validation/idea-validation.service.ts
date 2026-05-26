import { Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';

import { type IdeaValidation } from '@shipyard/db';

import { PrismaService } from '../prisma/prisma.service';
import type { ValidationOutput } from './validation-types';

/**
 * アイデア検証(IDEA_VALIDATION、ADR-013 改訂版「2 モード化」)の Service。
 *
 * Project.status = IDEA のときに実行する Lean Startup の Problem-Solution Fit 検証機能。
 * ProductDiagnosisService と並ぶ独立 Service で、データソースが異なる
 * (Project の詳細情報フィールドが中心、README / LP / ChecklistItem は不要)。
 *
 * Day 44 ではデータアクセス + 骨組みのみ実装。Sonnet 4 + Web Search Tool + Tool Use の
 * 実呼び出しは Day 45 で `runValidation()` の本実装として追加する。
 *
 * `/workspaces/:slug/...` ルートは ALS のテナントコンテキストを持たないため、`tenantId` は
 * 引数で受け取り全クエリに明示注入する(implementation-rules.md「テナント解決」)。
 */
@Injectable()
export class IdeaValidationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * テナント + プロジェクトに紐づく検証履歴を新しい順で取得する。
   * Day 46-47 の FE 履歴一覧画面で使用。
   */
  async getHistory(tenantId: string, projectId: string): Promise<IdeaValidation[]> {
    return this.prisma.ideaValidation.findMany({
      where: { tenantId, projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 特定の検証結果を ID で取得する。
   * `tenantId` フィルタでテナント越境を防ぐ。不在 / 他テナントは 404(ADR-003 と同方針)。
   */
  async getById(tenantId: string, id: string): Promise<IdeaValidation> {
    const validation = await this.prisma.ideaValidation.findFirst({
      where: { id, tenantId },
    });
    if (!validation) {
      throw new NotFoundException('指定されたアイデア検証結果は存在しません。');
    }
    return validation;
  }

  /**
   * 新規アイデア検証を実行する(Day 45 で完成予定)。
   *
   * 実装予定の処理フロー:
   *   1. `AIUsageService.assertWithinValidationQuota({ tenantId, plan })` で Free フォールバック 403 + Pro/Team 月次上限チェック
   *   2. Project + 詳細情報フィールド(targetUsers / problemStatement / proposedFeatures / pricingModel)を取得
   *   3. 詳細情報フィールドが全て空なら 400(検証不能、編集画面で入力を促すよう FE 側でガード推奨)
   *   4. system prompt 構築:`AI_PERSONA_INTRO` + `formatValidationRubricForPrompt()` +
   *      `VALIDATION_RECOMMENDATION_GUIDANCE` + 「厳しく採点せよ。GO は明確に進めるべきアイデアのみ」
   *   5. Sonnet 4 + Anthropic server-side Web Search Tool + Tool Use(`submit_idea_validation` を `tool_choice` で強制)+
   *      `temperature=IDEA_VALIDATION_TEMPERATURE`(0.2)+ `max_tokens=IDEA_VALIDATION_MAX_TOKENS`(4096)で呼び出し
   *   6. `parseValidationOutput`(validation-schema.ts)で整合性検証(recommendation 妥当性 + totalScore 整合性 + URL 安全性)
   *   7. `IdeaValidation` INSERT + `AIUsage` 記録(Feature.IDEA_VALIDATION + Web Search のトークンは Feature.OTHER で別途)
   *   8. 結果を返す
   *
   * Day 44 時点では呼び出されたら 501 を返す(骨組み確認用)。
   */
  async runValidation(_input: {
    tenantId: string;
    projectId: string;
    userId: string;
    plan: string;
    instructions?: string;
  }): Promise<{ validation: IdeaValidation; output: ValidationOutput }> {
    throw new NotImplementedException(
      'IDEA_VALIDATION の実呼び出しは Day 45 で実装されます(ADR-013 改訂版)。',
    );
  }
}
