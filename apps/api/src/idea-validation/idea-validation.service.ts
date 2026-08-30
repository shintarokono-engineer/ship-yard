import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { Feature, type IdeaValidation, type Plan, type Prisma } from '@shipyard/db';

import {
  AI_MODEL_HAIKU,
  AI_MODEL_SONNET,
  IDEA_VALIDATION_MAX_TOKENS,
  IDEA_VALIDATION_TEMPERATURE,
  WEB_SEARCH_MAX_USES,
  WEB_SEARCH_TOOL_NAME,
  WEB_SEARCH_TOOL_TYPE,
} from '../ai/shared/ai.constants';
import { AIUsageService, sumCostJpy } from '../ai/shared/ai-usage.service';
import { AnthropicService } from '../ai/shared/anthropic.service';
import { AI_PERSONA_INTRO } from '../ai/shared/prompts';
import { extractTextContentOrNull, extractToolUseBlock } from '../ai/shared/tool-use';
import { logTwoStepUsage } from '../ai/shared/turn-usage-log';
import { PrismaService } from '../prisma/prisma.service';
import { formatStructuredBriefForPrompt } from '../projects/project-brief.constants';
import {
  formatValidationRubricForPrompt,
  VALIDATION_RECOMMENDATION_GUIDANCE,
} from './validation.constants';
import { parseValidationOutput, SUBMIT_IDEA_VALIDATION_TOOL } from './validation-schema';
import type { ValidationOutput } from './validation-types';
import { translateAIProviderError } from '../ai/shared/ai-error';

/**
 * アイデア検証(IDEA_VALIDATION、ADR-013 改訂版「2 モード化」)の Service。
 *
 * Project.status = IDEA のときに使う、Lean Startup の Problem-Solution Fit 検証機能。
 * ProductDiagnosisService と独立した Service で、データソースが異なる
 * (Project の詳細情報フィールドが中心、README / LP / ChecklistItem は使わない)。
 */
@Injectable()
export class IdeaValidationService {
  private readonly logger = new Logger(IdeaValidationService.name);

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
        '- URL は**その製品の公式ページ**を指してください。製品自身のサイト、または制作者が出している製品ページ(公式ストア・出展ページ等)が該当します。',
        '  ニュース記事・プレスリリース・まとめサイト・第三者のデータベース・小売店の商品ページは公式ではありません。',
        '  独自ドメインを持つ製品ならトップページで構いません。企業サイトやマーケットプレイス内の製品なら、その製品のページを指してください。',
        '  **検索結果で実際に開いて確認した URL だけを使い、URL の規則から推測して組み立てないでください。**確認できなければ、その競合は含めなくて構いません。',
        '- 競合が見つからない場合は「該当なし」 と明示してください(無理に捏造しない)。',
        '- 採点は次のターンで行うので、このターンでは採点コメントや GO/PIVOT/NO_GO 判定は出さないでください。',
      ].join('\n');

      // ADR-016:turn 1 は Web 検索と要約のみで採点しないため Haiku で足りる。
      // PRODUCT_DIAGNOSIS の実測ではトークンの 63% が turn 1 に乗っており、
      // ここを Sonnet($3/$15)から Haiku($1/$5)に落とすのが最大の削減になる。
      // 採点は turn 2 の Sonnet が行うのでスコアの質には影響しない。
      const turn1 = await this.anthropic.client.messages.create({
        model: AI_MODEL_HAIKU,
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

      // 🔴 `extractTextContent` は text が空だと 502 を投げる。turn 1 が要約を出し切れなかっただけで
      // 診断全体を落とす理由は無いため、非 throw 版を使い「競合 0 件」 として採点を続行する。
      const researchText =
        extractTextContentOrNull(turn1) ??
        '(競合調査の結果を取得できませんでした。競合は 0 件として扱ってください)';

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
        '- **記述の巧拙ではなく、記述されている内容の実質**を評価してください。文章表現や書き方の改善提案は出さないこと。',
        '- 実質を判断できるだけの材料が無い場合は、文章を採点せず「判断材料が不足している」 として低く付け、何を書けば判断できるかを提案に書いてください。',
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
        '- 各 ref は実在する URL を必須とし、**直前のターンの調査結果に記載されていたもの**に限定してください(捏造禁止)。',
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
          // ADR-016:turn 1 の**最終テキストだけ**を渡す。`turn1.content` をそのまま渡すと
          // `web_search_tool_result` まで再送され、turn 2 の入力が二重に膨らむ。turn 1 の
          // system prompt が「名前 / URL / 概要 / 類似性を箇条書きで」 とまとめさせているため、
          // 採点に必要な情報は最終テキストに揃っている。
          { role: 'assistant', content: researchText },
          {
            role: 'user',
            content:
              '上記の競合調査結果を踏まえ、`submit_idea_validation` ツールでスコア化結果を提出してください。',
          },
        ],
      });

      // コスト検討用の turn 別内訳(AIUsage は合算しか持たないため。`turn-usage-log.ts` 参照)
      logTwoStepUsage(this.logger, 'IDEA_VALIDATION', turn1, turn2);

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
            // ADR-016 以降 turn 1 は Haiku、turn 2 は Sonnet の混在。ここは**採点したモデル**
            // (turn 2)を記録する。実費の内訳は `AIUsage.costJpy`(`sumCostJpy` で turn 別に積算)を見る。
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
      // ADR-016:turn 1 = Haiku / turn 2 = Sonnet でモデルが異なるため、円コストは turn ごとに積算する
      // (行の model = Sonnet だけで見積もると turn 1 まで Sonnet 単価になり実費を過大記録する)。
      await this.aiUsage.finalizeReservation(
        reservationId,
        {
          tokensIn: turn1.usage.input_tokens + turn2.usage.input_tokens,
          tokensOut: turn1.usage.output_tokens + turn2.usage.output_tokens,
        },
        sumCostJpy([
          // 定数を直書きせず応答の model を使う。turn の model を変えたときに
          // ここを直し忘れて costJpy が静かに誤るのを防ぐ。
          {
            model: turn1.model,
            tokensIn: turn1.usage.input_tokens,
            tokensOut: turn1.usage.output_tokens,
          },
          {
            model: turn2.model,
            tokensIn: turn2.usage.input_tokens,
            tokensOut: turn2.usage.output_tokens,
          },
        ]),
      );
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
      // SDK 例外は既定フィルタで 500 + 汎用文言になり、クレジット枯渇のような運用側の
      // 設定不備とコードのバグを区別できないため、ここで HTTP 例外へ翻訳する。
      throw translateAIProviderError(err, 'IDEA_VALIDATION', this.logger);
    }
  }
}
