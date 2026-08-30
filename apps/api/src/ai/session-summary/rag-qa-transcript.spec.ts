import { RagQaRole } from '@shipyard/db';
import { describe, expect, it } from 'vitest';

import { SESSION_SUMMARY_MESSAGE_TRUNCATE_CHARS } from '../_shared/ai.constants';
import { takeRecentWindow, toTranscriptReferences } from './rag-qa-transcript';

const MESSAGES = [
  { role: RagQaRole.USER, content: '個人開発者向けのツールを作りたい' },
  { role: RagQaRole.ASSISTANT, content: 'ターゲットを絞ると差別化しやすくなります' },
  { role: RagQaRole.USER, content: 'リリース準備の抜け漏れを潰す用途に寄せます' },
];

describe('toTranscriptReferences', () => {
  it('発話者を日本語ラベルに解決する', () => {
    expect(toTranscriptReferences(MESSAGES).map((r) => r.title)).toEqual([
      'ユーザー',
      'AI',
      'ユーザー',
    ]);
  });

  it('入力の並び順を保つ', () => {
    expect(toTranscriptReferences(MESSAGES).map((r) => r.content)).toEqual([
      '個人開発者向けのツールを作りたい',
      'ターゲットを絞ると差別化しやすくなります',
      'リリース準備の抜け漏れを潰す用途に寄せます',
    ]);
  });

  it('上限を超える本文は切り詰めて「…」を付ける', () => {
    const long = 'あ'.repeat(50);
    const refs = toTranscriptReferences([{ role: RagQaRole.USER, content: long }], 10);
    expect(refs.map((r) => r.content)).toEqual([`${'あ'.repeat(10)}…`]);
  });

  it('上限ちょうどの本文は切り詰めない(「…」を付けない)', () => {
    const exact = 'あ'.repeat(10);
    const refs = toTranscriptReferences([{ role: RagQaRole.USER, content: exact }], 10);
    expect(refs.map((r) => r.content)).toEqual([exact]);
  });

  it('既定の切り詰め幅は SESSION_SUMMARY_MESSAGE_TRUNCATE_CHARS', () => {
    const long = 'い'.repeat(SESSION_SUMMARY_MESSAGE_TRUNCATE_CHARS + 100);
    const refs = toTranscriptReferences([{ role: RagQaRole.ASSISTANT, content: long }]);
    expect(refs.map((r) => r.content.length)).toEqual([SESSION_SUMMARY_MESSAGE_TRUNCATE_CHARS + 1]);
  });

  it('空配列は空配列を返す', () => {
    expect(toTranscriptReferences([])).toEqual([]);
  });
});

describe('takeRecentWindow', () => {
  const rows = [1, 2, 3, 4, 5];

  it('上限以下ならそのまま返し truncated は false', () => {
    expect(takeRecentWindow(rows, 5)).toEqual({ messages: [1, 2, 3, 4, 5], truncated: false });
    expect(takeRecentWindow(rows, 10)).toEqual({ messages: [1, 2, 3, 4, 5], truncated: false });
  });

  it('上限を超えたら「直近」= 末尾から max 件を残す(古い順で渡す前提)', () => {
    expect(takeRecentWindow(rows, 3)).toEqual({ messages: [3, 4, 5], truncated: true });
  });

  it('max + 1 件を渡す運用で、1 件だけ余ったときに truncated が立つ', () => {
    expect(takeRecentWindow([1, 2, 3, 4], 3)).toEqual({ messages: [2, 3, 4], truncated: true });
  });

  it('空配列でも壊れない', () => {
    expect(takeRecentWindow([], 3)).toEqual({ messages: [], truncated: false });
  });

  it('入力配列を破壊しない', () => {
    const original = [1, 2, 3, 4, 5];
    takeRecentWindow(original, 2);
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });
});
