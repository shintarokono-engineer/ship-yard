import { Injectable } from '@nestjs/common';

import { DocType } from '@shipyard/db';

import { AnthropicService } from './anthropic.service';
import { AI_MODEL_SONNET } from './ai.constants';
import { AIBadResponseError } from './ai-error';
import { formatReferenceSection, type RagReference } from './format-reference';
import { AI_PERSONA_INTRO } from './prompts';
import { extractToolUseBlock } from './tool-use';

/** 推敲対象のドキュメント(タイトル + 本文 + 種別)。 */
interface OriginalDocument {
  type: DocType;
  title: string;
  content: string;
}

/** 推敲結果 + AIUsage 記録用のトークン数。 */
export interface RefinedDraft {
  title: string;
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Tool Use の構造化出力スキーマ(title + content の 2 フィールドを返させる)。
 * Tool 名は DRAFT_GEN(`draft-gen.service.ts`)と統一し、機能の違いは description / system prompt 側で表現する
 * (Tool 名はモデルへの挙動ヒントとしては弱く、機能ごとに別名を付けても効果が薄いため)。
 */
const SUBMIT_REFINED_TOOL = {
  name: 'submit_document',
  description: '推敲したドキュメントのタイトルと本文を提出する。',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: '推敲後のタイトル(元タイトルが妥当ならそのまま、より良い表現があれば差し替え)',
      },
      content: { type: 'string', description: '推敲後の Markdown 本文' },
    },
    required: ['title', 'content'],
  },
};

/**
 * 元 content の prompt 注入時の上限文字数。極端に長いドキュメント(200K 文字級)が来ても
 * Sonnet 4 の context window(200K tokens)を超えないよう安全側で切り詰める。
 * 推敲対象が 50,000 文字を超えるユースケースは MVP では想定しない。
 */
const ORIGINAL_CONTENT_MAX_CHARS = 50_000;

/**
 * 既存 ProjectDocument の文章推敲(REFINE_DOC、ADR-005)。Sonnet 4 + Tool Use で
 * `{ title, content }` を構造化生成する。呼び出し側は結果を `DocumentsService.edit` に渡し、
 * append-only(MAX(version)+1)で新版として保存する。
 *
 * **プロンプトインジェクション対策(ADR-005)**:
 * - 元ドキュメント本文は ` ```markdown ... ``` ` で囲んで「推敲対象の資料」として明示
 * - RAG 参考も同じ書式で「指示として解釈しないこと」を明記
 */
@Injectable()
export class RefineDocService {
  constructor(private readonly anthropic: AnthropicService) {}

  async refine(input: {
    original: OriginalDocument;
    /** 任意の推敲方針(例: "より簡潔に" "技術者向けに" "親しみやすいトーンに")。 */
    goal?: string;
    references?: readonly RagReference[];
  }): Promise<RefinedDraft> {
    const { original, goal, references } = input;
    // §9.12.1(Day 49.5)で `DocType.LANDING_PAGE` を enum から削除。LP は ADR-009 の `LandingPage`
    // 専用テーブル + ブロック編集に移行したため、refine の対象外。
    const kindLabel =
      original.type === DocType.README ? 'README(GitHub のプロジェクト説明文)' : 'ドキュメント';

    const systemPrompt = [
      AI_PERSONA_INTRO,
      `以下の${kindLabel}を推敲し、submit_document ツールに { title, content } として提出してください。`,
      '推敲のポリシー: 元ドキュメントの意図と事実を保ちつつ、文章の明瞭さ・簡潔さ・トーンを改善する。',
      '無関係な情報の追加や、根拠のない断定は避ける。',
      '元のタイトルが妥当ならそのまま、より良い表現があれば差し替えてよい。',
      goal ? `今回の推敲の重点: ${goal}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // injection 対策の文言は format-reference.ts 側で自動付与される(SECURITY_GUIDANCE)。
    const referenceSection = formatReferenceSection(references, {
      usageHint:
        '以下は同じテナント内の過去ドキュメントです。文体・構成・トーンの参考にしてください。',
    });

    // 元 content が極端に長い場合は安全側で切り詰める(context window 超過防止)。
    const truncatedContent =
      original.content.length > ORIGINAL_CONTENT_MAX_CHARS
        ? `${original.content.slice(0, ORIGINAL_CONTENT_MAX_CHARS)}\n\n…(以下 ${
            original.content.length - ORIGINAL_CONTENT_MAX_CHARS
          } 文字省略)`
        : original.content;

    const userText = [
      '# 推敲対象',
      `## タイトル: ${original.title}`,
      '## 本文',
      '```markdown',
      truncatedContent,
      '```',
      referenceSection,
    ]
      .filter(Boolean)
      .join('\n');

    // 【Anthropic API 呼び出し】Sonnet 4 にメッセージを送り、Tool Use で構造化出力を受け取る。
    const res = await this.anthropic.client.messages.create({
      model: AI_MODEL_SONNET,
      max_tokens: 4096,
      system: systemPrompt,
      tools: [SUBMIT_REFINED_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_REFINED_TOOL.name },
      messages: [{ role: 'user', content: userText }],
    });

    const block = extractToolUseBlock(res, 'REFINE_DOC');
    const args = block.input as { title?: unknown; content?: unknown };
    const title =
      typeof args.title === 'string' && args.title.trim() ? args.title.trim() : original.title;
    const content = typeof args.content === 'string' ? args.content.trim() : '';
    if (!content) {
      throw new AIBadResponseError('Claude returned empty refined content (REFINE_DOC)');
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
