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
   * 新規プロダクト診断を実行する(ADR-013、Day 45 本実装)。
   *
   * 処理フロー(ADR-013 改訂版 § Day 43-46 のフォローアップに基づく):
   *   1. プラン quota チェック(`AIUsageService.assertWithinDiagnosisQuota`)
   *   2. Project + 関連データ(詳細フィールド / README / LP / ChecklistItem 進捗 / 前回スコア)を収集
   *   3. system prompt 構築(`AI_PERSONA_INTRO` + `formatRubricForPrompt()` + 「厳しく採点せよ」)
   *   4. Sonnet 4 + Web Search Tool + Tool Use(`submit_service_score` を `tool_choice` で強制)
   *      + `temperature=0.2` + `max_tokens=4096` で呼び出し
   *   5. `parseDiagnosisOutput` で整合性検証(totalScore = sum of breakdown.score、URL 安全性)
   *   6. `ServiceScore` INSERT + AIUsage 2 段記録(PRODUCT_DIAGNOSIS + Web Search 使用時 OTHER)
   *   7. 結果を返す
   */
  async runDiagnosis(input: {
    tenantId: string;
    projectId: string;
    userId: string;
    plan: Plan;
    instructions?: string;
  }): Promise<{ score: ServiceScore; output: DiagnosisOutput }> {
    // 1. プラン quota チェック(Free フォールバック 403 / Pro/Team 月次上限)
    await this.aiUsage.assertWithinDiagnosisQuota({ id: input.tenantId, plan: input.plan });

    // 2. Project + 関連データ収集
    const project = await this.prisma.project.findFirst({
      where: { id: input.projectId, tenantId: input.tenantId },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        targetUsers: true,
        problemStatement: true,
        proposedFeatures: true,
        pricingModel: true,
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

    // 3. system prompt 構築
    const systemPrompt = [
      AI_PERSONA_INTRO,
      'あなたの今回の任務は、提示されたプロダクトを以下の rubric で客観的に診断することです。',
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
      '- Web Search Tool で類似プロダクトを 3-5 件取得し、`competitorRefs` に保存してください。',
      '- 検索クエリはプロダクト名・カテゴリ・想定機能から構築してください。',
      '- Web Search に失敗 / 該当なしの場合は空配列で構いません(評価は継続)。',
    ].join('\n');

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

    const userText = [
      '# プロジェクト情報',
      `- 名前: ${project.name}`,
      `- 概要: ${project.description?.trim() || '(未記入)'}`,
      `- 状態: ${project.status}`,
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

    // 5. Sonnet 4 + Web Search Tool + Tool Use 呼び出し
    // Web Search Tool 単独の型を SDK が完全には公開していないため、tools 配列は any キャストで渡す
    // (lp-gen.service.ts の tools と同じく、Tool Use 強制パターン)
    const res = await this.anthropic.client.messages.create({
      model: AI_MODEL_SONNET,
      max_tokens: PRODUCT_DIAGNOSIS_MAX_TOKENS,
      temperature: PRODUCT_DIAGNOSIS_TEMPERATURE,
      system: systemPrompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [
        {
          type: WEB_SEARCH_TOOL_TYPE,
          name: WEB_SEARCH_TOOL_NAME,
          max_uses: WEB_SEARCH_MAX_USES,
        } as any,
        SUBMIT_SERVICE_SCORE_TOOL,
      ],
      tool_choice: { type: 'tool', name: SUBMIT_SERVICE_SCORE_TOOL.name },
      messages: [{ role: 'user', content: userText }],
    });

    // 6. 整合性検証(totalScore = sum of breakdown、URL 安全性、recommendation 妥当性)
    const block = extractToolUseBlock(res, 'PRODUCT_DIAGNOSIS');
    const output = parseDiagnosisOutput(block.input);

    // Web Search Tool を使ったかは usage.server_tool_use.web_search_requests > 0 で判定
    // SDK の型が server_tool_use 部分まで完全に公開されていないため any でアクセス
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webSearchRequests = (res.usage as any)?.server_tool_use?.web_search_requests ?? 0;
    const webSearchUsed = webSearchRequests > 0;

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
    await this.aiUsage.record({
      tenantId: input.tenantId,
      userId: input.userId,
      model: AI_MODEL_SONNET,
      feature: Feature.PRODUCT_DIAGNOSIS,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
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
  }
}
