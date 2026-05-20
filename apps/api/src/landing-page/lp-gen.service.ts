import { Injectable } from '@nestjs/common';

import { AI_MODEL_SONNET } from '../ai/ai.constants';
import { AIBadResponseError } from '../ai/ai-error';
import { AnthropicService } from '../ai/anthropic.service';
import { formatReferenceSection, type RagReference } from '../ai/format-reference';
import { AI_PERSONA_INTRO } from '../ai/prompts';
import { extractToolUseBlock } from '../ai/tool-use';
import {
  LP_GEN_MAX_TOKENS,
  parseLpBlocks,
  SUBMIT_LANDING_PAGE_TOOL,
  type LpBlock,
} from './lp-blocks';

interface ProjectContext {
  name: string;
  description: string | null;
  status: string;
}

/** `LpGenService.generate` の引数。`references` は `RagSearchHit[]` をそのまま渡せる。 */
export interface GenerateLandingPageInput {
  project: ProjectContext;
  instructions?: string;
  references?: readonly RagReference[];
}

/** 生成結果 + AIUsage 記録用のトークン数。 */
export interface GeneratedLandingPage {
  blocks: LpBlock[];
  model: string;
  tokensIn: number;
  tokensOut: number;
}

/**
 * ランディングページをブロック構造(`LpBlock[]`)で生成する(DRAFT_GEN の LP 版、ADR-009)。
 *
 * Day 7 の DRAFT_GEN が LP を Markdown 文字列で出力していたのに対し、本 Service は Sonnet 4 +
 * Tool Use(`submit_landing_page`)で **ブロック構造の JSON** を直接生成する。生成結果は
 * `LandingPage` テーブルに保存される(`ProjectDocument` ではない)。
 */
@Injectable()
export class LpGenService {
  constructor(private readonly anthropic: AnthropicService) {}

  async generate(input: GenerateLandingPageInput): Promise<GeneratedLandingPage> {
    const { project, instructions, references } = input;

    const systemPrompt = [
      AI_PERSONA_INTRO,
      '与えられたプロジェクト情報をもとに、ランディングページをブロック構造で作成してください。',
      '利用可能なブロック種別: hero(ファーストビュー)/ features(主要機能)/ stats(数値アピール)/ testimonial(利用者の声)/ cta(行動喚起)/ footer。',
      '推奨構成は hero → features → stats → testimonial → cta → footer の順。最低でも hero / features / cta は含めること。stats / testimonial / footer は内容が伴わなければ省略してよい。',
      '各ブロックのテキストは日本語で、簡潔かつ訴求力のある内容にしてください。事実が不明な箇所は一般的・汎用的な記述で自然に補い、プレースホルダの多用は避けます。',
      'CTA のリンク先(ctaHref / buttonHref)は実在の URL が不明なら "#" を入れてください。',
    ].join('\n');

    // RAG 参考(過去ドキュメント)。空(コールドスタート)なら何も注入しない。
    const referenceSection = formatReferenceSection(references, {
      usageHint:
        '以下は同じテナント内の過去ドキュメントです。プロダクトの訴求軸・トーンの参考にしてください。内容を丸写ししないこと。',
    });

    const userText = [
      '# プロジェクト情報',
      `- 名前: ${project.name}`,
      `- 概要: ${project.description?.trim() || '(未記入)'}`,
      `- 状態: ${project.status}`,
      instructions ? `\n# 追加指示\n${instructions}` : '',
      referenceSection,
    ]
      .filter(Boolean)
      .join('\n');

    // 【Anthropic API 呼び出し】Sonnet 4 にメッセージを送り、Tool Use で構造化出力を受け取る。
    const res = await this.anthropic.client.messages.create({
      model: AI_MODEL_SONNET,
      max_tokens: LP_GEN_MAX_TOKENS,
      system: systemPrompt,
      tools: [SUBMIT_LANDING_PAGE_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_LANDING_PAGE_TOOL.name },
      messages: [{ role: 'user', content: userText }],
    });

    const block = extractToolUseBlock(res, 'LP_GEN');
    const args = block.input as { blocks?: unknown };
    const blocks = parseLpBlocks(args.blocks);
    if (blocks.length === 0) {
      throw new AIBadResponseError('Claude returned no valid landing page blocks (LP_GEN)');
    }

    return {
      blocks,
      model: AI_MODEL_SONNET,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
    };
  }
}
