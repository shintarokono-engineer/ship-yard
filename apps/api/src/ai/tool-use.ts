import type Anthropic from '@anthropic-ai/sdk';

import { AIBadResponseError } from './ai-error';

/**
 * Anthropic Messages API のレスポンスから tool_use ブロックを抽出する共通ヘルパー(Day 16)。
 *
 * 4 機能(DRAFT_GEN / CHECKLIST_GEN / REFINE_DOC / TASK_SPLIT)で同じ抽出 + 例外スローの
 * パターンを書いていたため共通化。`tool_choice: { type: 'tool', name }` で強制しているため
 * 通常は必ず tool_use が返るが、モデル出力が完全に従う保証は無いので二重防御で TS 側でも検証。
 *
 * 欠落時は 502(`AIBadResponseError`、上流依存の不正レスポンス)。
 *
 * `featureName` は例外メッセージに付与する機能識別子(例: 'DRAFT_GEN')。運用ログ / Sentry での
 * 切り分けに使うため、機能名を必ず付ける運用にしている。
 */
export function extractToolUseBlock(
  res: Anthropic.Messages.Message,
  featureName: string,
): Anthropic.Messages.ToolUseBlock {
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new AIBadResponseError(
      `Claude did not return the expected tool_use block (${featureName})`,
    );
  }
  return block;
}

/**
 * Anthropic Messages API のレスポンスから自由文の text ブロックを抽出する共通ヘルパー(Day 27 RAG_QA 用)。
 * Tool Use を使わない機能(RAG_QA の会話応答 等)向け。複数 text ブロックが返る場合は連結する。
 *
 * 空 / 欠落時は 502(`AIBadResponseError`、上流依存の不正レスポンス)。
 */
export function extractTextContent(res: Anthropic.Messages.Message, featureName: string): string {
  const text = res.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) {
    throw new AIBadResponseError(`Claude returned no text content (${featureName})`);
  }
  return text;
}
