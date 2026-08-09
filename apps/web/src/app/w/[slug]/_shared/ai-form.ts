/**
 * AI を呼ぶ Server Action 群で共有する定数・エラー振り分けヘルパー。文言をここに集約する。
 *
 * **status を足すときは `AiErrorKind` / `classifyAiApiError` / 各 Server Action の分岐の
 * 3 箇所を揃えること。** 分岐を漏らすとフォールバックに落ちて「HTTP 5xx」と表示される。
 */

import { extractValidationMessages, type ApiError } from '@/lib/api/errors';

/** AI Server Action の追加プロンプト最大長(apps/api 各 DTO の `@MaxLength(2000)` と同期)。 */
export const INSTRUCTIONS_MAX_LENGTH = 2000;

/** REFINE_DOC の推敲方針(goal)最大長(apps/api `RefineDocumentDto` の `@MaxLength(1000)` と同期)。 */
export const GOAL_MAX_LENGTH = 1000;

/** Free フォールバック状態(トライアル後、AI 停止)時の UI 文言(ADR-012)。 */
export const AI_QUOTA_FREE_FALLBACK_MESSAGE =
  'このワークスペースの AI 機能は停止中です。Pro / Team プランへアップグレードすると AI 機能を再開できます。';

/** Pro / Team で月次 AI クレジット上限に達したときの UI 文言(ADR-012)。 */
export const AI_QUOTA_CREDITS_EXCEEDED_MESSAGE =
  '今月の AI クレジットを使い切りました。来月の更新までお待ちください(将来は追加クレジット購入も予定)。';

/** AI 機能で扱うエラーの種類。 */
export type AiErrorKind =
  | 'quota_exceeded'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'bad_response'
  | 'timeout'
  | 'unavailable'
  | 'unknown';

/**
 * `ApiError` を AI 機能向けに分類する。
 *
 * 上限関連は API 側で 403 を返し、本文に判別用キーワードを含める
 * (`apps/api/src/ai/ai-usage.service.ts:assertWithinPlanCredits`):
 * - Free フォールバック → 「AI 機能は停止」
 * - Pro / Team クレジット超過 → 「AI クレジット」
 */
export function classifyAiApiError(e: ApiError): {
  kind: AiErrorKind;
  /** 表示用メッセージ。`unknown` / `not_found` / `bad_request` はバリデーション由来のため空になりうる。 */
  messages: string[];
} {
  const validation = extractValidationMessages(e.body);
  const fallback =
    e.body && typeof e.body === 'object' && 'message' in e.body
      ? String((e.body as { message?: unknown }).message ?? '')
      : '';

  if (e.status === 403) {
    const text = validation[0] ?? fallback;
    if (text.includes('AI 機能は停止')) {
      return { kind: 'quota_exceeded', messages: [AI_QUOTA_FREE_FALLBACK_MESSAGE] };
    }
    if (text.includes('AI クレジット')) {
      return { kind: 'quota_exceeded', messages: [AI_QUOTA_CREDITS_EXCEEDED_MESSAGE] };
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
  // 504 = `apiFetch` のタイムアウト。API 側では処理が続いている可能性があるため、
  // 再実行(クレジット二重消費)ではなく再読み込みを促す。
  if (e.status === 504) {
    return {
      kind: 'timeout',
      messages: [
        '処理に時間がかかりすぎたため中断しました。ページを再読み込みすると結果が保存されている場合があります。',
      ],
    };
  }
  // 503 = AI プロバイダのアカウント不備 / レート制限。API 側が整形済みの文言をそのまま出す。
  if (e.status === 503) {
    // `fallback` は該当なしのとき空文字。`??` では既定文言に落ちないので `||` を使う。
    return {
      kind: 'unavailable',
      messages: [
        validation[0] ||
          fallback ||
          'AI 機能が一時的に利用できません。少し時間を置いてお試しください。',
      ],
    };
  }
  return { kind: 'unknown', messages: validation };
}
