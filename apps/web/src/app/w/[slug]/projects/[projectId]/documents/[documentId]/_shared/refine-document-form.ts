/**
 * REFINE_DOC(AI による ProjectDocument 推敲)Server Action で共有する型・定数・ヘルパー。
 *
 * `'use server'` ファイルから値を export できない制約のため、定数・型・同期パースはここに集約。
 */

import { GOAL_MAX_LENGTH } from '@/app/w/[slug]/_shared/ai-form';

export { GOAL_MAX_LENGTH };

export const FORM_FIELDS = ['goal'] as const;
export type FieldName = (typeof FORM_FIELDS)[number];

export interface RefineDocumentFormState {
  ok: boolean;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
  formError?: string;
  /** Free 上限到達時のみ true。 */
  quotaExceeded?: boolean;
  fields?: { goal?: string };
}

export const INITIAL_REFINE_DOCUMENT_FORM_STATE: RefineDocumentFormState = { ok: false };

/** `FormData` から goal を取り出してバリデーション。 */
export function parseRefineDocumentFormData(formData: FormData): {
  goal: string | undefined;
  fieldErrors: Partial<Record<FieldName, string[]>>;
  fields: { goal: string };
} {
  const goalRaw = String(formData.get('goal') ?? '').replace(/\s+$/, '');

  const fieldErrors: Partial<Record<FieldName, string[]>> = {};

  if (goalRaw.length > GOAL_MAX_LENGTH) {
    fieldErrors.goal = [
      `推敲の方向性は ${GOAL_MAX_LENGTH.toLocaleString()} 文字以内で入力してください。`,
    ];
  }

  return {
    goal: goalRaw.length > 0 ? goalRaw : undefined,
    fieldErrors,
    fields: { goal: goalRaw },
  };
}
