import { RagQaRole } from '@shipyard/db';

import { SESSION_SUMMARY_MESSAGE_TRUNCATE_CHARS } from '../shared/ai.constants';
import type { RagReference } from '../shared/format-reference';

/** プロンプト整形に必要な最小型。 */
export interface TranscriptMessage {
  role: RagQaRole;
  content: string;
}

const ROLE_LABELS: Record<RagQaRole, string> = {
  [RagQaRole.USER]: 'ユーザー',
  [RagQaRole.ASSISTANT]: 'AI',
};

/**
 * 直近 `max` 件を切り出し、捨てた発言があるかを返す。`messages` は古い順。
 * 呼び出し側が `max + 1` 件渡すことで COUNT 無しに `truncated` を判定できる。
 */
export function takeRecentWindow<T>(
  messages: readonly T[],
  max: number,
): { messages: T[]; truncated: boolean } {
  if (messages.length <= max) return { messages: [...messages], truncated: false };
  return { messages: messages.slice(messages.length - max), truncated: true };
}

/**
 * 発言列を参考ブロックへ変換する。並び順は入力のまま。
 *
 * `RagReference` に寄せることで `formatReferenceSection` の封入(コードブロック +
 * 注入対策の固定文言)を必ず通す。発言本文は 1 件 8,000 字のユーザー自由入力。
 */
export function toTranscriptReferences(
  messages: readonly TranscriptMessage[],
  maxChars: number = SESSION_SUMMARY_MESSAGE_TRUNCATE_CHARS,
): RagReference[] {
  return messages.map((m) => ({
    title: ROLE_LABELS[m.role],
    content: truncate(m.content, maxChars),
  }));
}

function truncate(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}…`;
}
