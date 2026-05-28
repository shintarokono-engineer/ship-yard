/**
 * プロダクト診断 Server Action(`run-diagnosis.ts`)で共有する型・定数・パース。
 *
 * `'use server'` ファイルから定数を export できない制約のため、ここに集約する
 * (RAG_QA / DRAFT_GEN / アイデア検証と同じ `_shared/*-form.ts` パターン)。
 */

import { INSTRUCTIONS_MAX_LENGTH } from '@/app/w/[slug]/_shared/ai-form';

export { INSTRUCTIONS_MAX_LENGTH };

export interface RunDiagnosisFormState {
  ok: boolean;
  fieldError?: string;
  formError?: string;
  /** Pro/Team へのアップグレード導線を出すかどうか(`quota_exceeded` 種別)。 */
  quotaExceeded?: boolean;
  /** 成功時に作成された ServiceScore の ID。 */
  createdId?: string;
  instructions?: string;
}

export const INITIAL_RUN_DIAGNOSIS_FORM_STATE: RunDiagnosisFormState = { ok: false };

export function parseRunDiagnosisFormData(formData: FormData): {
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
