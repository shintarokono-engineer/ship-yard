/**
 * AI 機能(DRAFT_GEN / CHECKLIST_GEN / TASK_SPLIT / REFINE_DOC)の Server Action 群で共有する
 * 定数・エラー振り分けヘルパー。
 *
 * 個別の form モジュール(`documents/_shared/generate-document-form.ts` 等)からはここを参照し、
 * 上限超過 / 権限不足 / 不正リクエスト / AI 502 をユーザーに表示する文言に揃える。
 */

import { extractValidationMessages, type ApiError } from '@/lib/api/errors';

/** AI Server Action の追加プロンプト最大長(apps/api 各 DTO の `@MaxLength(2000)` と同期)。 */
export const INSTRUCTIONS_MAX_LENGTH = 2000;

/** REFINE_DOC の推敲方針(goal)最大長(apps/api `RefineDocumentDto` の `@MaxLength(1000)` と同期)。 */
export const GOAL_MAX_LENGTH = 1000;

/** Free プラン上限到達時の UI 文言。Pro 課金導線は Day 24 で `/billing` に差し替え予定。 */
export const AI_QUOTA_EXCEEDED_MESSAGE =
  '月の AI 利用上限(20 回)に達しました。Pro にアップグレードすると無制限に使えます。';

/** AI 機能で扱うエラーの種類。 */
export type AiErrorKind =
  | 'quota_exceeded'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'bad_response'
  | 'unknown';

/**
 * `ApiError` を AI 機能向けに分類する。
 *
 * 上限超過は API 側で 403 + メッセージに固定文字列「AI 利用上限」を含む
 * (`apps/api/src/ai/ai-usage.service.ts:assertWithinFreeQuota`)。
 * `code` フィールドが入ったら厳密化する(Day 24 課金実装と合わせて検討、本実装ではスコープ外)。
 */
export function classifyAiApiError(e: ApiError): { kind: AiErrorKind; messages: string[] } {
  const validation = extractValidationMessages(e.body);
  const fallback =
    e.body && typeof e.body === 'object' && 'message' in e.body
      ? String((e.body as { message?: unknown }).message ?? '')
      : '';

  if (e.status === 403) {
    const text = validation[0] ?? fallback;
    if (text.includes('AI 利用上限')) {
      return { kind: 'quota_exceeded', messages: [AI_QUOTA_EXCEEDED_MESSAGE] };
    }
    return { kind: 'forbidden', messages: [text || 'この操作は許可されていません。'] };
  }
  if (e.status === 404) return { kind: 'not_found', messages: validation };
  if (e.status === 400) return { kind: 'bad_request', messages: validation };
  if (e.status === 502) {
    return {
      kind: 'bad_response',
      messages: ['AI 応答エラーが発生しました。少し時間を置いて再度お試しください。'],
    };
  }
  return { kind: 'unknown', messages: validation };
}
