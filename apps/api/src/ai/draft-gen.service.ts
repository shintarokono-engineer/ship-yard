import { Injectable } from '@nestjs/common';

import { DocType } from '@shipyard/db';

import { AnthropicService } from './anthropic.service';
import { AI_MODEL_SONNET, DRAFT_GEN_MAX_TOKENS, type DocKind } from './ai.constants';
import { AIBadResponseError } from './ai-error';
import { formatReferenceSection, type RagReference } from './format-reference';
import { AI_PERSONA_INTRO } from './prompts';
import { extractToolUseBlock } from './tool-use';

interface ProjectContext {
  name: string;
  description: string | null;
  status: string;
}

/** `DraftGenService.generate` の引数。`references` は `RagSearchHit[]` をそのまま渡せる(`RagSearchHit extends RagReference`)。 */
export interface GenerateDraftInput {
  project: ProjectContext;
  kind: DocKind;
  instructions?: string;
  references?: readonly RagReference[];
}

/** 生成結果 + AIUsage 記録用のトークン数。 */
export interface GeneratedDraft {
  title: string;
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

/** DocType ごとの「何を生成するか」ラベル(systemPrompt 用)。`GENERATABLE_DOC_TYPES` を網羅する。 */
const KIND_LABEL: Record<DocKind, string> = {
  [DocType.README]: 'README(GitHub のプロジェクト説明文)',
};

/** DocType ごとの構成指示(systemPrompt 用)。`GENERATABLE_DOC_TYPES` を網羅する。 */
const STRUCTURE_HINT: Record<DocKind, string> = {
  [DocType.README]: '「概要」「主要機能」「セットアップ手順」「使い方」の節を含めること。',
};

/** Tool Use の構造化出力スキーマ(title + content の 2 フィールドに分けたいので Tool Use を使う、ADR-005)。 */
const SUBMIT_DOCUMENT_TOOL = {
  name: 'submit_document',
  description: '生成したドキュメントのドラフトを提出する。',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'ドキュメントのタイトル(短く)' },
      content: { type: 'string', description: 'Markdown 本文' },
    },
    required: ['title', 'content'],
  },
};

/**
 * README ドラフトを Claude(Sonnet 4)で生成する(DRAFT_GEN、ADR-005)。
 *
 * 構造化出力(title / content の 2 フィールド)が欲しいので Tool Use を使い、`tool_choice` で
 * `submit_document` の呼び出しを強制する(自由文ではなく必ずツール入力として返させる)。
 *
 * 注:LP は ADR-009 で別経路(`LandingPage` テーブル + ブロック生成)、告知文(Twitter / Blog)は
 * ADR-014 で `Feature.ANNOUNCEMENT_GEN`(マルチチャネル一括 Tool Use)に分離済。本サービスは README 専用。
 */
@Injectable()
export class DraftGenService {
  constructor(private readonly anthropic: AnthropicService) {}

  async generate(input: GenerateDraftInput): Promise<GeneratedDraft> {
    const { project, kind, instructions, references } = input;
    const kindLabel = KIND_LABEL[kind];
    const structureHint = STRUCTURE_HINT[kind];

    const systemPrompt = [
      AI_PERSONA_INTRO,
      `与えられたプロジェクト情報をもとに、${kindLabel}のドラフトを日本語の Markdown で作成してください。`,
      '簡潔かつ訴求力のある内容にしてください。事実が不明な箇所は、一般的・汎用的な記述で自然に補ってください。どうしても利用者本人が記入すべき箇所のみ、簡潔なプレースホルダを最小限置いてください。プレースホルダの多用は避けます。',
      structureHint,
    ].join('\n');

    // RAG 参考(過去プロジェクト)。空(コールドスタート)なら何も注入しない。
    // injection 対策の文言は format-reference.ts 側で自動付与される(SECURITY_GUIDANCE)。
    const referenceSection = formatReferenceSection(references, {
      usageHint:
        '以下は同じテナント内の過去ドキュメントです。文体・構成・トーンの参考にしてください。内容を丸写ししないこと。',
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
      max_tokens: DRAFT_GEN_MAX_TOKENS,
      system: systemPrompt,
      tools: [SUBMIT_DOCUMENT_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_DOCUMENT_TOOL.name },
      messages: [{ role: 'user', content: userText }],
    });

    const block = extractToolUseBlock(res, 'DRAFT_GEN');
    const args = block.input as { title?: unknown; content?: unknown };
    const title =
      typeof args.title === 'string' && args.title.trim() ? args.title.trim() : project.name;
    const content = typeof args.content === 'string' ? args.content.trim() : '';
    if (!content) {
      throw new AIBadResponseError('Claude returned empty document content (DRAFT_GEN)');
    }

    return {
      title,
      content,
      model: AI_MODEL_SONNET,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
    };
  }
}
