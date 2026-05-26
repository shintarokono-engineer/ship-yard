import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Feature, type IdeaValidation, type Plan, type Prisma } from '@shipyard/db';

import {
  AI_MODEL_SONNET,
  IDEA_VALIDATION_MAX_TOKENS,
  IDEA_VALIDATION_TEMPERATURE,
  WEB_SEARCH_MAX_USES,
  WEB_SEARCH_TOOL_NAME,
  WEB_SEARCH_TOOL_TYPE,
} from '../ai/ai.constants';
import { AIUsageService } from '../ai/ai-usage.service';
import { AnthropicService } from '../ai/anthropic.service';
import { AI_PERSONA_INTRO } from '../ai/prompts';
import { extractToolUseBlock } from '../ai/tool-use';
import { PrismaService } from '../prisma/prisma.service';
import {
  formatValidationRubricForPrompt,
  VALIDATION_RECOMMENDATION_GUIDANCE,
} from './validation.constants';
import { parseValidationOutput, SUBMIT_IDEA_VALIDATION_TOOL } from './validation-schema';
import type { ValidationOutput } from './validation-types';

/**
 * アイデア検証(IDEA_VALIDATION、ADR-013 改訂版「2 モード化」)の Service。
 *
 * Project.status = IDEA のときに使う、Lean Startup の Problem-Solution Fit 検証機能。
 * ProductDiagnosisService と独立した Service で、データソースが異なる
 * (Project の詳細情報フィールドが中心、README / LP / ChecklistItem は使わない)。
 */
@Injectable()
export class IdeaValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly aiUsage: AIUsageService,
  ) {}

  async getHistory(tenantId: string, projectId: string): Promise<IdeaValidation[]> {
    return this.prisma.ideaValidation.findMany({
      where: { tenantId, projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(tenantId: string, id: string): Promise<IdeaValidation> {
    const validation = await this.prisma.ideaValidation.findFirst({ where: { id, tenantId } });
    if (!validation) {
      throw new NotFoundException('指定されたアイデア検証結果は存在しません。');
    }
    return validation;
  }

  /**
   * 新規アイデア検証を実行する(ADR-013 改訂版、Day 45 本実装)。
   *
   * 処理フロー:
   *   1. プラン quota チェック(`AIUsageService.assertWithinValidationQuota`)
   *   2. Project + 詳細情報フィールドを取得(README/LP/ChecklistItem は使わない、IDEA 段階なので不要)
   *   3. 詳細情報フィールドが全て空なら 400(検証不能、編集画面で入力を促すよう FE 側でガード推奨)
   *   4. system prompt 構築(`AI_PERSONA_INTRO` + `formatValidationRubricForPrompt()` +
   *      `VALIDATION_RECOMMENDATION_GUIDANCE` + 「厳しく採点せよ」)
   *   5. Sonnet 4 + Web Search Tool + Tool Use(`submit_idea_validation` を `tool_choice` で強制)+
   *      `temperature=0.2` + `max_tokens=4096` で呼び出し
   *   6. `parseValidationOutput` で整合性検証(recommendation 妥当性 + totalScore 整合性 + URL 安全性)
   *   7. `IdeaValidation` INSERT + AIUsage 2 段記録(IDEA_VALIDATION + Web Search 使用時 OTHER)
   *   8. 結果を返す
   */
  async runValidation(input: {
    tenantId: string;
    projectId: string;
    userId: string;
    plan: Plan;
    instructions?: string;
  }): Promise<{ validation: IdeaValidation; output: ValidationOutput }> {
    // 1. プラン quota チェック
    await this.aiUsage.assertWithinValidationQuota({ id: input.tenantId, plan: input.plan });

    // 2. Project + 詳細情報フィールドを取得
    const project = await this.prisma.project.findFirst({
      where: { id: input.projectId, tenantId: input.tenantId },
      select: {
        id: true,
        name: true,
        description: true,
        targetUsers: true,
        problemStatement: true,
        proposedFeatures: true,
        pricingModel: true,
      },
    });
    if (!project) {
      throw new NotFoundException('プロジェクトが見つかりません。');
    }

    // 3. 詳細情報フィールドが全て空なら 400(アイデア検証は事業情報がないと評価不能)。
    // description(概要)も含めて何らかの事業情報が入っていれば検証可能とする
    // (新規プロジェクトで description だけ書いた段階でもアイデア検証を試せる UX を想定、
    // ADR-013 改訂版「2 モード化」 の詳細フィールドは厳密チェックではなく緩めの判定)。
    const hasAnyDetail =
      project.targetUsers?.trim() ||
      project.problemStatement?.trim() ||
      project.proposedFeatures?.trim() ||
      project.pricingModel?.trim() ||
      project.description?.trim();
    if (!hasAnyDetail) {
      throw new BadRequestException(
        'アイデア検証にはプロジェクトの詳細情報(想定ユーザー / 解きたい課題 / 想定機能 / 想定価格)の入力が必要です。プロジェクト編集画面の「詳細情報」 タブから入力してください。',
      );
    }

    // 4. system prompt 構築
    const systemPrompt = [
      AI_PERSONA_INTRO,
      'あなたの今回の任務は、提示された「これから作るプロダクトのアイデア」 を Lean Startup の Problem-Solution Fit の観点で診断することです。',
      'まだ実装されていない発案段階のアイデアなので、機能完成度やリリース準備度は評価対象外です。',
      '',
      '## 評価軸(5 軸 × 各 0-20 点 = 総合 100 点満点)',
      formatValidationRubricForPrompt(),
      '',
      '## 採点ポリシー(厳格性確保)',
      '- 高得点(15 点以上)は明確な強みがある場合のみ付けてください。安易に高得点を付けないこと。',
      '- 各軸の comment には採点根拠を 1-3 文で具体的に書いてください。',
      '- totalScore は breakdown の 5 軸合計と必ず一致させてください(不一致は不正回答として扱われます)。',
      '',
      '## recommendation 判定',
      VALIDATION_RECOMMENDATION_GUIDANCE,
      '',
      '## 改善提案',
      '- 優先度 HIGH / MEDIUM / LOW に分け、3-5 件返してください。',
      '- 各提案には axis(改善対象軸)を必ず紐付けてください。',
      '- アイデア段階なので「Pivot 候補」「ターゲット絞り込み」「課題定義の鋭利化」 系の提案が中心になる想定です。',
      '',
      '## 競合参照',
      '- Web Search Tool で類似プロダクトを 3-5 件取得し、`competitorRefs` に保存してください。',
      '- 検索クエリはプロダクト名・想定ユーザー・解きたい課題から構築してください。',
      '- Web Search に失敗 / 該当なしの場合は空配列で構いません(評価は継続)。',
    ].join('\n');

    // 5. user prompt 構築
    const userText = [
      '# プロダクトアイデア情報',
      `- 名前: ${project.name}`,
      `- 概要: ${project.description?.trim() || '(未記入)'}`,
      `- 想定ユーザー: ${project.targetUsers?.trim() || '(未入力)'}`,
      `- 解きたい課題: ${project.problemStatement?.trim() || '(未入力)'}`,
      `- 想定機能: ${project.proposedFeatures?.trim() || '(未入力)'}`,
      `- 想定価格: ${project.pricingModel?.trim() || '(未入力)'}`,
      input.instructions ? `\n# 追加指示\n${input.instructions}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // 6. Sonnet 4 + Web Search Tool + Tool Use 呼び出し
    const res = await this.anthropic.client.messages.create({
      model: AI_MODEL_SONNET,
      max_tokens: IDEA_VALIDATION_MAX_TOKENS,
      temperature: IDEA_VALIDATION_TEMPERATURE,
      system: systemPrompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [
        {
          type: WEB_SEARCH_TOOL_TYPE,
          name: WEB_SEARCH_TOOL_NAME,
          max_uses: WEB_SEARCH_MAX_USES,
        } as any,
        SUBMIT_IDEA_VALIDATION_TOOL,
      ],
      tool_choice: { type: 'tool', name: SUBMIT_IDEA_VALIDATION_TOOL.name },
      messages: [{ role: 'user', content: userText }],
    });

    // 7. 整合性検証
    const block = extractToolUseBlock(res, 'IDEA_VALIDATION');
    const output = parseValidationOutput(block.input);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webSearchRequests = (res.usage as any)?.server_tool_use?.web_search_requests ?? 0;
    const webSearchUsed = webSearchRequests > 0;

    // 8. IdeaValidation INSERT + AIUsage 2 段記録
    const validation = await this.prisma.$transaction(async (tx) => {
      return tx.ideaValidation.create({
        data: {
          tenantId: input.tenantId,
          projectId: input.projectId,
          totalScore: output.totalScore,
          recommendation: output.recommendation,
          breakdown: output.breakdown as unknown as Prisma.InputJsonValue,
          suggestions: output.suggestions as unknown as Prisma.InputJsonValue,
          competitorRefs: output.competitorRefs as unknown as Prisma.InputJsonValue,
          webSearchUsed,
          modelUsed: AI_MODEL_SONNET,
          createdById: input.userId,
        },
      });
    });

    // AIUsage 記録は ADR-005「課金・上限判定の根拠なので取りこぼし禁止」 のため await 必須。
    // record 失敗時はそのまま例外伝播(500)し、ユーザーには再実行を促す方が安全
    // (UNIQUE 違反等で握りつぶすと検証は成功してるのに上限カウントから漏れる事故を防ぐ)。
    await this.aiUsage.record({
      tenantId: input.tenantId,
      userId: input.userId,
      model: AI_MODEL_SONNET,
      feature: Feature.IDEA_VALIDATION,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
    });
    if (webSearchUsed) {
      await this.aiUsage.record({
        tenantId: input.tenantId,
        userId: input.userId,
        model: AI_MODEL_SONNET,
        feature: Feature.OTHER,
        tokensIn: 0,
        tokensOut: webSearchRequests,
      });
    }

    return { validation, output };
  }
}
