import { Injectable, NotFoundException } from '@nestjs/common';

import { Feature, type Plan, type Prisma, type ServiceScore } from '@shipyard/db';

import {
  AI_MODEL_SONNET,
  PRODUCT_DIAGNOSIS_MAX_TOKENS,
  PRODUCT_DIAGNOSIS_TEMPERATURE,
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
import { formatRubricForPrompt } from './diagnosis.constants';
import { parseDiagnosisOutput, SUBMIT_SERVICE_SCORE_TOOL } from './diagnosis-schema';
import type { DiagnosisOutput } from './diagnosis-types';

/**
 * プロダクト診断(PRODUCT_DIAGNOSIS、ADR-013)の Service。
 *
 * Project.status = IN_DEV 以降のときに使う、構築済プロダクトの実用性スコア化機能。
 * `/workspaces/:slug/...` ルートは ALS のテナントコンテキストを持たないため、`tenantId` は
 * 引数で受け取り全クエリに明示注入する(implementation-rules.md「テナント解決」)。
 */
@Injectable()
export class ProductDiagnosisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly aiUsage: AIUsageService,
  ) {}

  async getHistory(tenantId: string, projectId: string): Promise<ServiceScore[]> {
    return this.prisma.serviceScore.findMany({
      where: { tenantId, projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(tenantId: string, id: string): Promise<ServiceScore> {
    const score = await this.prisma.serviceScore.findFirst({ where: { id, tenantId } });
    if (!score) {
      throw new NotFoundException('指定された診断結果は存在しません。');
    }
    return score;
  }

  /**
   * 新規プロダクト診断を実行する(ADR-013、Day 45 本実装 / Day 47.5 で 2-step 化)。
   *
   * 処理フロー:
   *   1. プラン quota チェック(`AIUsageService.assertWithinDiagnosisQuota`)
   *   2. Project + 関連データ(詳細フィールド / README / LP / ChecklistItem 進捗 / 前回スコア)を収集
   *   3. user prompt 構築(両ターンで共通)
   *   4. ターン 1: `tools: [web_search]` + `tool_choice: 'auto'` で類似プロダクトを調査
   *      (Day 47.5 修正:旧実装は `tool_choice: { type: 'tool', name: submit_* }` で submit を
   *      強制していたため Web Search Tool が呼ばれず `competitorRefs=[]` で固定されていた)
   *   5. ターン 2: ターン 1 の調査結果を `assistant` メッセージとして context に含め、
   *      `tools: [submit_service_score]` + `tool_choice: { type: 'tool' }` で構造化出力
   *   6. `parseDiagnosisOutput` で整合性検証(totalScore = sum of breakdown.score、URL 安全性)
   *   7. `ServiceScore` INSERT + AIUsage 2 段記録(PRODUCT_DIAGNOSIS + Web Search 使用時 OTHER)
   *   8. 結果を返す
   */
  async runDiagnosis(input: {
    tenantId: string;
    projectId: string;
    userId: string;
    plan: Plan;
    instructions?: string;
  }): Promise<{ score: ServiceScore; output: DiagnosisOutput }> {
    // 1. プラン quota チェック(Free フォールバック 403 / Pro/Team 月次上限)+ クレジット予約。
    //    本機能固有の月次回数上限をまず確認し、続いてクレジットを AI 呼び出しの「前」に原子的に予約する
    //    (TOCTOU 回避、ADR-012)。2-step 生成なので turnCount:2(Sonnet 3cr × 2 = 6cr)。
    //    以降で失敗したら catch で予約を解放し、失敗した診断でクレジットを消費しない。
    await this.aiUsage.assertWithinDiagnosisQuota({ id: input.tenantId, plan: input.plan });
    const reservationId = await this.aiUsage.reserveCredits(
      { id: input.tenantId, plan: input.plan },
      {
        userId: input.userId,
        model: AI_MODEL_SONNET,
        feature: Feature.PRODUCT_DIAGNOSIS,
        turnCount: 2,
      },
    );
    try {
      // 2. Project + 関連データ収集
      const project = await this.prisma.project.findFirst({
        where: { id: input.projectId, tenantId: input.tenantId },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          // 自由補足 4 フィールド(Day 44)
          targetUsers: true,
          problemStatement: true,
          proposedFeatures: true,
          pricingModel: true,
          // 構造化セレクト 2 フィールド(Day 46.5 案 A)
          categoryDomain: true,
          pricingTier: true,
        },
      });
      if (!project) {
        throw new NotFoundException('プロジェクトが見つかりません。');
      }

      const [documents, checklistGroups, landingPage, lastScore] = await Promise.all([
        this.prisma.projectDocument.findMany({
          where: { tenantId: input.tenantId, projectId: input.projectId, deletedAt: null },
          select: { type: true, title: true, content: true, version: true },
          orderBy: [{ type: 'asc' }, { version: 'desc' }],
        }),
        this.prisma.checklistItem.groupBy({
          by: ['category', 'status'],
          where: { tenantId: input.tenantId, projectId: input.projectId },
          _count: { _all: true },
        }),
        this.prisma.landingPage.findFirst({
          where: { tenantId: input.tenantId, projectId: input.projectId },
          select: { blocks: true, publishedAt: true },
        }),
        this.prisma.serviceScore.findFirst({
          where: { tenantId: input.tenantId, projectId: input.projectId },
          orderBy: { createdAt: 'desc' },
          select: { totalScore: true, breakdown: true, createdAt: true },
        }),
      ]);

      // 各 (projectId, type) の最新版のみに絞る(orderBy で type ASC + version DESC のため最初が最新)
      const latestDocsByType = new Map<string, (typeof documents)[number]>();
      for (const doc of documents) {
        if (!latestDocsByType.has(doc.type)) latestDocsByType.set(doc.type, doc);
      }

      // 3. user prompt 構築は後段で行う(2-step の両ターンで共通の userText を使うため先に組み立てる)
      // 旧実装はここで採点用 systemPrompt を組み立てていたが、Day 47.5 で 2-step 化した結果、
      // researchSystemPrompt(調査用)と scoringSystemPrompt(採点用)に分割した。

      // 4. user prompt 構築
      const checklistSummary = checklistGroups
        .map((g) => `- ${g.category} / ${g.status}: ${g._count._all} 件`)
        .join('\n');
      const documentSummary = Array.from(latestDocsByType.values())
        .map((d) => `### ${d.type} v${d.version}: ${d.title}\n${d.content.slice(0, 2000)}`)
        .join('\n\n');
      const landingPageSummary = landingPage
        ? `公開状態: ${landingPage.publishedAt ? '公開中' : '未公開'}\nブロック構造: ${JSON.stringify(landingPage.blocks).slice(0, 2000)}`
        : '(未生成)';
      const lastScoreSummary = lastScore
        ? `前回スコア: ${lastScore.totalScore}/100(${lastScore.createdAt.toISOString().slice(0, 10)} 実施)\n前回ブレークダウン: ${JSON.stringify(lastScore.breakdown)}`
        : '(本機能の初回診断)';

      // 構造化セレクト 2 フィールド(Day 46.5 案 A、ADR-013 改訂版 v2)を AI 用に整形
      const structuredBrief = formatStructuredBriefForPrompt({
        categoryDomain: project.categoryDomain,
        pricingTier: project.pricingTier,
      });

      const userText = [
        '# プロジェクト情報',
        `- 名前: ${project.name}`,
        `- 概要: ${project.description?.trim() || '(未記入)'}`,
        `- 状態: ${project.status}`,
        structuredBrief || '- (構造化情報なし)',
        '',
        '# 補足(自由記述)',
        `- 想定ユーザー: ${project.targetUsers?.trim() || '(未入力)'}`,
        `- 解きたい課題: ${project.problemStatement?.trim() || '(未入力)'}`,
        `- 想定機能: ${project.proposedFeatures?.trim() || '(未入力)'}`,
        `- 想定価格: ${project.pricingModel?.trim() || '(未入力)'}`,
        '',
        '# 既存ドキュメント',
        documentSummary || '(なし)',
        '',
        '# チェックリスト進捗(category × status)',
        checklistSummary || '(なし)',
        '',
        '# ランディングページ',
        landingPageSummary,
        '',
        '# 前回診断との比較',
        lastScoreSummary,
        input.instructions ? `\n# 追加指示\n${input.instructions}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      // 5. ターン 1: Web Search で類似プロダクトを調査(Day 47.5、2-step 化の前半)
      //
      // 旧実装は 1 回の messages.create で `tool_choice: { type: 'tool', name: SUBMIT_* }` を使い
      // submit_service_score を強制呼び出ししていたが、これだと Web Search Tool が呼ばれず
      // `competitorRefs=[]` で固定されていた(Anthropic API の仕様で、tool_choice 固定時は
      // 指定された tool 以外は呼ばれない)。2-step に分けることで Web Search 実行を保証する。
      const researchSystemPrompt = [
        AI_PERSONA_INTRO,
        'あなたの今回の任務は、提示されたプロダクトと類似する既存サービスを Web 検索で調査することです。',
        '',
        '## 指示',
        '- Web Search Tool を使い、類似 / 競合サービスを **3〜5 件** 取得してください。',
        '- 検索クエリはプロダクト名・カテゴリ・想定機能から組み立ててください。複数回検索しても構いません(最大 5 回)。',
        '- 結果は箇条書きで「名前 / 公式 URL / 概要(2〜3 文) / 本プロダクトとの類似性」 を 1 件ずつまとめてください。',
        '- 競合が見つからない場合は「該当なし」 と明示してください(無理に捏造しない)。',
        '- 採点は次のターンで行うので、このターンでは採点コメントは出さないでください。',
      ].join('\n');

      const turn1 = await this.anthropic.client.messages.create({
        model: AI_MODEL_SONNET,
        max_tokens: PRODUCT_DIAGNOSIS_MAX_TOKENS,
        temperature: PRODUCT_DIAGNOSIS_TEMPERATURE,
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

      // Web Search Tool を使ったかは usage.server_tool_use.web_search_requests > 0 で判定
      // SDK の型が server_tool_use 部分まで完全に公開されていないため any でアクセス
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const webSearchRequests = (turn1.usage as any)?.server_tool_use?.web_search_requests ?? 0;
      const webSearchUsed = webSearchRequests > 0;

      // 6. ターン 2: ターン 1 の調査結果を context に含めて構造化出力(Day 47.5、2-step 化の後半)
      const scoringSystemPrompt = [
        AI_PERSONA_INTRO,
        'あなたの今回の任務は、提示されたプロダクトを以下の rubric で客観的に診断することです。',
        '直前のターンで実施した競合調査の結果を必ず参照してください。',
        '',
        '## 評価軸(5 軸 × 各 0-20 点 = 総合 100 点満点)',
        formatRubricForPrompt(),
        '',
        '## 採点ポリシー(厳格性確保)',
        '- 高得点(15 点以上)は明確な強みがある場合のみ付けてください。安易に高得点を付けないこと。',
        '- 各軸の comment には採点根拠を 1-3 文で具体的に書いてください(「〇〇が△△で評価できる」 等)。',
        '- totalScore は breakdown の 5 軸合計と必ず一致させてください(不一致は不正回答として扱われます)。',
        '',
        '## 改善提案',
        '- 優先度 HIGH / MEDIUM / LOW に分け、3-5 件返してください。',
        '- 各提案には axis(改善対象軸)を必ず紐付けてください。',
        '',
        '## 競合参照',
        '- 直前のターンで Web Search で取得した類似プロダクトを `competitorRefs` に格納してください。',
        '- 各 ref は実在する URL を必須とし、Web Search 結果に含まれていたものに限定してください(捏造禁止)。',
        '- 競合が 0 件なら空配列で構いません。',
      ].join('\n');

      const turn2 = await this.anthropic.client.messages.create({
        model: AI_MODEL_SONNET,
        max_tokens: PRODUCT_DIAGNOSIS_MAX_TOKENS,
        temperature: PRODUCT_DIAGNOSIS_TEMPERATURE,
        system: scoringSystemPrompt,
        tools: [SUBMIT_SERVICE_SCORE_TOOL],
        tool_choice: { type: 'tool', name: SUBMIT_SERVICE_SCORE_TOOL.name },
        messages: [
          { role: 'user', content: userText },
          { role: 'assistant', content: turn1.content },
          {
            role: 'user',
            content:
              '上記の競合調査結果を踏まえ、`submit_service_score` ツールでスコア化結果を提出してください。',
          },
        ],
      });

      // 7. 整合性検証(totalScore = sum of breakdown、URL 安全性)
      const block = extractToolUseBlock(turn2, 'PRODUCT_DIAGNOSIS');
      const output = parseDiagnosisOutput(block.input);

      // 7. ServiceScore INSERT + AIUsage 2 段記録(本生成 + Web Search 使用時 OTHER)
      const score = await this.prisma.$transaction(async (tx) => {
        const inserted = await tx.serviceScore.create({
          data: {
            tenantId: input.tenantId,
            projectId: input.projectId,
            totalScore: output.totalScore,
            breakdown: output.breakdown as unknown as Prisma.InputJsonValue,
            suggestions: output.suggestions as unknown as Prisma.InputJsonValue,
            competitorRefs: output.competitorRefs as unknown as Prisma.InputJsonValue,
            webSearchUsed,
            modelUsed: AI_MODEL_SONNET,
            createdById: input.userId,
          },
        });
        return inserted;
      });

      // AIUsage 記録は ADR-005「課金・上限判定の根拠なので取りこぼし禁止」 のため await 必須。
      // record 失敗時はそのまま例外伝播(500)し、ユーザーには再診断を促す方が安全
      // (UNIQUE 違反等で握りつぶすと診断は成功してるのに上限カウントから漏れる事故を防ぐ)。
      // Web Search Tool 使用時は OTHER で別レコード(本生成は PRODUCT_DIAGNOSIS、Day 13 RAG 二段記録パターン)。
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
          // Web Search の input_tokens は本生成側に含まれているため 0、出力は web_search_requests 数を擬似的に記録
          tokensIn: 0,
          tokensOut: webSearchRequests,
        });
      }

      return { score, output };
    } catch (err) {
      // AI 呼び出し / パース / 永続化のいずれかが失敗したら予約を解放する(失敗診断で課金しない)。
      await this.aiUsage.releaseReservation(reservationId);
      throw err;
    }
  }
}
