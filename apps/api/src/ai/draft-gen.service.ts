import { Injectable } from '@nestjs/common';

import { DocType } from '@shipyard/db';

import { AnthropicService } from './anthropic.service';
import { AI_MODEL_SONNET, type DocKind } from './ai.constants';

interface ProjectContext {
  name: string;
  description: string | null;
  status: string;
}

/** 生成結果 + AIUsage 記録用のトークン数。 */
export interface GeneratedDraft {
  title: string;
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

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
 * README / ランディングページのドラフトを Claude(Sonnet 4)で生成する(DRAFT_GEN、ADR-005)。
 *
 * 構造化出力(title / content の 2 フィールド)が欲しいので Tool Use を使い、`tool_choice` で
 * `submit_document` の呼び出しを強制する(自由文ではなく必ずツール入力として返させる)。
 */
@Injectable()
export class DraftGenService {
  constructor(private readonly anthropic: AnthropicService) {}

  async generate(input: {
    project: ProjectContext;
    kind: DocKind;
    instructions?: string;
  }): Promise<GeneratedDraft> {
    const { project, kind, instructions } = input;
    const kindLabel =
      kind === DocType.README ? 'README(GitHub のプロジェクト説明文)' : 'ランディングページ本文';
    const structureHint =
      kind === DocType.README
        ? '「概要」「主要機能」「セットアップ手順」「使い方」の節を含めること。'
        : '「キャッチコピー」「課題提起」「解決策」「主要機能」「CTA(行動喚起)」の流れで構成すること。';

    const systemPrompt = [
      'あなたは個人開発者・小規模チームのプロダクトリリースを支援するアシスタントです。',
      `与えられたプロジェクト情報をもとに、${kindLabel}のドラフトを日本語の Markdown で作成してください。`,
      '簡潔かつ訴求力のある内容にし、事実が不明な箇所は無理に断定せずプレースホルダ(例: 「(ここに〜を記載)」)を置いてください。',
      structureHint,
    ].join('');

    const userText = [
      '# プロジェクト情報',
      `- 名前: ${project.name}`,
      `- 概要: ${project.description?.trim() || '(未記入)'}`,
      `- 状態: ${project.status}`,
      instructions ? `\n# 追加指示\n${instructions}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // 【Anthropic API 呼び出し】Sonnet 4 にメッセージを送り、Tool Use で構造化出力を受け取る。
    const res = await this.anthropic.client.messages.create({
      model: AI_MODEL_SONNET,
      max_tokens: 4096,
      system: systemPrompt,
      tools: [SUBMIT_DOCUMENT_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_DOCUMENT_TOOL.name },
      messages: [{ role: 'user', content: userText }],
    });

    const block = res.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      throw new Error('Claude did not return the expected tool_use block');
    }
    const args = block.input as { title?: unknown; content?: unknown };
    const title =
      typeof args.title === 'string' && args.title.trim() ? args.title.trim() : project.name;
    const content = typeof args.content === 'string' ? args.content.trim() : '';
    if (!content) {
      throw new Error('Claude returned empty document content');
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
