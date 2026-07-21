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
import { formatStructuredBriefForPrompt } from '../projects/project-brief.constants';
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
   * 新規アイデア検証を実行する(ADR-013 改訂版、Day 45 本実装 / Day 47.5 で 2-step 化)。
   *
   * 処理フロー:
   *   1. プラン quota チェック(`AIUsageService.assertWithinValidationQuota`)
   *   2. Project + 詳細情報フィールドを取得(README/LP/ChecklistItem は使わない、IDEA 段階なので不要)
   *   3. 詳細情報フィールドが全て空なら 400(検証不能、編集画面で入力を促すよう FE 側でガード推奨)
   *   4. ターン 1: `tools: [web_search]` + `tool_choice: 'auto'` で類似プロダクトを調査
   *      (Day 47.5 修正:旧実装は `tool_choice: { type: 'tool', name: submit_* }` で submit を
   *      強制していたため Web Search Tool が呼ばれず `competitorRefs=[]` で固定されていた)
   *   5. ターン 2: ターン 1 の調査結果を `assistant` メッセージとして context に含め、
   *      `tools: [submit_idea_validation]` + `tool_choice: { type: 'tool' }` で構造化出力
   *      (`temperature=0.2` + `max_tokens=4096`)
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
    // 1. 本機能固有の月次回数上限を確認し、続いてクレジットを AI 呼び出しの「前」に原子的に予約する
    //    (TOCTOU 回避、ADR-012)。2-step 生成なので turnCount:2(Sonnet 3cr × 2 = 6cr)。
    //    以降で失敗したら catch で予約を解放し、失敗した検証でクレジットを消費しない。
    await this.aiUsage.assertWithinValidationQuota({ id: input.tenantId, plan: input.plan });
    const reservationId = await this.aiUsage.reserveCredits(
      { id: input.tenantId, plan: input.plan },
      {
        userId: input.userId,
        model: AI_MODEL_SONNET,
        feature: Feature.IDEA_VALIDATION,
        turnCount: 2,
      },
    );
    try {
      // 2. Project + 詳細情報フィールドを取得
      const project = await this.prisma.project.findFirst({
        where: { id: input.projectId, tenantId: input.tenantId },
        select: {
          id: true,
          name: true,
          description: true,
          // 自由補足 4 フィールド(Day 44)
          targetUsers: true,
          problemStatement: true,
          proposedFeatures: true,
          pricingModel: true,
          // 構造化セレクト 2 フィールド(Day 46.5 案 A、ADR-013 改訂版「構造化入力 v2」)
          categoryDomain: true,
          pricingTier: true,
        },
      });
      if (!project) {
        throw new NotFoundException('プロジェクトが見つかりません。');
      }

      // 3. 詳細情報フィールドが全て空なら 400(アイデア検証は事業情報がないと評価不能)。
      // 自由補足 4 + description + 構造化セレクト 2(categoryDomain / pricingTier)のいずれかに
      // 値があれば検証可能とする(緩めの判定、ADR-013 改訂版「構造化入力 v2」)。
      const hasAnyDetail =
        project.targetUsers?.trim() ||
        project.problemStatement?.trim() ||
        project.proposedFeatures?.trim() ||
        project.pricingModel?.trim() ||
        project.description?.trim() ||
        project.categoryDomain ||
        project.pricingTier;
      if (!hasAnyDetail) {
        throw new BadRequestException(
          'アイデア検証にはプロジェクトの詳細情報(想定ユーザー / 解きたい課題 / 想定機能 / 想定価格 / ドメイン分類 / 課金モデル)のいずれかの入力が必要です。プロジェクト編集画面の「詳細情報」 から入力してください。',
        );
      }

      // 4. user prompt 構築(構造化セレクト 2 + 自由補足 4 のハイブリッド、ADR-013 改訂版 v2)
      const structuredBrief = formatStructuredBriefForPrompt({
        categoryDomain: project.categoryDomain,
        pricingTier: project.pricingTier,
      });

      const userText = [
        '# プロダクトアイデア情報',
        `- 名前: ${project.name}`,
        `- 概要: ${project.description?.trim() || '(未記入)'}`,
        structuredBrief || '- (構造化情報なし)',
        '',
        '# 補足(自由記述)',
        `- 想定ユーザー: ${project.targetUsers?.trim() || '(未入力)'}`,
        `- 解きたい課題: ${project.problemStatement?.trim() || '(未入力)'}`,
        `- 想定機能: ${project.proposedFeatures?.trim() || '(未入力)'}`,
        `- 想定価格: ${project.pricingModel?.trim() || '(未入力)'}`,
        input.instructions ? `\n# 追加指示\n${input.instructions}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      // 5. ターン 1: Web Search で類似プロダクトを調査(Day 47.5、2-step 化の前半)
      //
      // 旧実装は 1 回の messages.create で `tool_choice: { type: 'tool', name: SUBMIT_* }` を使い
      // submit_idea_validation を強制呼び出ししていたが、これだと Web Search Tool が呼ばれず
      // `competitorRefs=[]` で固定されていた(Anthropic API の仕様で、tool_choice 固定時は
      // 指定された tool 以外は呼ばれない)。2-step に分けることで Web Search 実行を保証する。
      const researchSystemPrompt = [
        AI_PERSONA_INTRO,
        'あなたの今回の任務は、提示された「これから作るプロダクトのアイデア」 と類似する既存プロダクトを Web 検索で調査することです。',
        '',
        '## 指示',
        '- Web Search Tool を使い、類似 / 競合プロダクトを **3〜5 件** 取得してください。',
        '- 検索クエリはプロダクト名・想定ユーザー・解きたい課題から組み立ててください。複数回検索しても構いません(最大 5 回)。',
        '- 結果は箇条書きで「名前 / 公式 URL / 概要(2〜3 文) / 本プロダクトとの類似性」 を 1 件ずつまとめてください。',
        '- 競合が見つからない場合は「該当なし」 と明示してください(無理に捏造しない)。',
        '- 採点は次のターンで行うので、このターンでは採点コメントや GO/PIVOT/NO_GO 判定は出さないでください。',
      ].join('\n');

      const turn1 = await this.anthropic.client.messages.create({
        model: AI_MODEL_SONNET,
        max_tokens: IDEA_VALIDATION_MAX_TOKENS,
        temperature: IDEA_VALIDATION_TEMPERATURE,
        system: researchSystemPrompt,
        tools: [
          {
            type: WEB_SEARCH_TOOL_TYPE,
            name: WEB_SEARCH_TOOL_NAME,
            max_uses: WEB_SEARCH_MAX_USES,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: userText }],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const webSearchRequests = (turn1.usage as any)?.server_tool_use?.web_search_requests ?? 0;
      const webSearchUsed = webSearchRequests > 0;

      // 6. ターン 2: ターン 1 の調査結果を context に含めて構造化出力(Day 47.5、2-step 化の後半)
      //
      // ターン 1 の `assistant` メッセージ全体(server_tool_use + web_search_tool_result + 最終 text)
      // をそのまま context に渡すことで、Claude がターン 1 の調査結果を踏まえて採点 / 構造化出力を行う。
      const scoringSystemPrompt = [
        AI_PERSONA_INTRO,
        'あなたの今回の任務は、提示された「これから作るプロダクトのアイデア」 を Lean Startup の Problem-Solution Fit の観点で診断することです。',
        'まだ実装されていない発案段階のアイデアなので、機能完成度やリリース準備度は評価対象外です。',
        '直前のターンで実施した競合調査の結果を必ず参照してください。',
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
        '- 直前のターンで Web Search で取得した類似プロダクトを `competitorRefs` に格納してください。',
        '- 各 ref は実在する URL を必須とし、Web Search 結果に含まれていたものに限定してください(捏造禁止)。',
        '- 競合が 0 件なら空配列で構いません。',
      ].join('\n');

      const turn2 = await this.anthropic.client.messages.create({
        model: AI_MODEL_SONNET,
        max_tokens: IDEA_VALIDATION_MAX_TOKENS,
        temperature: IDEA_VALIDATION_TEMPERATURE,
        system: scoringSystemPrompt,
        tools: [SUBMIT_IDEA_VALIDATION_TOOL],
        tool_choice: { type: 'tool', name: SUBMIT_IDEA_VALIDATION_TOOL.name },
        messages: [
          { role: 'user', content: userText },
          { role: 'assistant', content: turn1.content },
          {
            role: 'user',
            content:
              '上記の競合調査結果を踏まえ、`submit_idea_validation` ツールでスコア化結果を提出してください。',
          },
        ],
      });

      // 7. 整合性検証(turn2 の Tool Use ブロックから submit_idea_validation を取り出す)
      const block = extractToolUseBlock(turn2, 'IDEA_VALIDATION');
      const output = parseValidationOutput(block.input);

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
      // Day 47.5 修正:2-step 化に伴い、本生成のトークン消費は turn1 + turn2 の合算で記録、
      // クレジット消費は `turnCount: 2` を渡して 6cr(Sonnet 3cr × 2)とする。
      // これにより `usedCredits` が実 API call 回数と一致し、ADR-012 のプラン上限判定が原価と整合する。
      // 予約したクレジット行に実トークン数を確定する(credits は予約時の 6cr のまま)。
      await this.aiUsage.finalizeReservation(reservationId, {
        tokensIn: turn1.usage.input_tokens + turn2.usage.input_tokens,
        tokensOut: turn1.usage.output_tokens + turn2.usage.output_tokens,
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
    } catch (err) {
      // AI 呼び出し / パース / 永続化のいずれかが失敗したら予約を解放する(失敗検証で課金しない)。
      await this.aiUsage.releaseReservation(reservationId);
      throw err;
    }
  }
}
