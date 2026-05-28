/**
 * アイデア検証 Server Action(`run-validation.ts`)で共有する型・定数・パース。
 *
 * `'use server'` ファイルから定数を export できない制約のため、ここに集約する
 * (RAG_QA / DRAFT_GEN と同じ `_shared/*-form.ts` パターン)。
 */

import { INSTRUCTIONS_MAX_LENGTH } from '@/app/w/[slug]/_shared/ai-form';

export { INSTRUCTIONS_MAX_LENGTH };

export interface RunValidationFormState {
  ok: boolean;
  /** instructions フィールドのバリデーションエラー。 */
  fieldError?: string;
  /** フォーム全体のエラー(認証 / 権限 / クレジット上限 / サーバー)。 */
  formError?: string;
  /** Pro/Team へのアップグレード導線を出すかどうか(`quota_exceeded` 種別)。 */
  quotaExceeded?: boolean;
  /** 成功時に作成された IdeaValidation の ID(Dialog 側が結果ページへ遷移する)。 */
  createdId?: string;
  /** 再表示用の入力値。 */
  instructions?: string;
}

export const INITIAL_RUN_VALIDATION_FORM_STATE: RunValidationFormState = { ok: false };

/** `FormData` から instructions を取り出してバリデーション。 */
export function parseRunValidationFormData(formData: FormData): {
  instructions?: string;
  fieldError?: string;
} {
  const raw = String(formData.get('instructions') ?? '').trim();
  if (raw.length === 0) return {};
  if (raw.length > INSTRUCTIONS_MAX_LENGTH) {
    return {
      instructions: raw,
      fieldError: `追加指示は ${INSTRUCTIONS_MAX_LENGTH} 文字以内で入力してください。`,
    };
  }
  return { instructions: raw };
}
