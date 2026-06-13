/**
 * REFINE_DOC(AI による README 推敲)Server Action で共有する型・定数・ヘルパー。
 *
 * §9.12.4(2026-05-29)で `documents/[documentId]/_shared/refine-document-form.ts` から README 専用に移植。
 * `'use server'` ファイルから値を export できない制約のため、定数・型・同期パースはここに集約。
 */

import { GOAL_MAX_LENGTH } from '@/app/w/[slug]/_shared/ai-form';

export { GOAL_MAX_LENGTH };

export const FORM_FIELDS = ['goal'] as const;
export type FieldName = (typeof FORM_FIELDS)[number];

export interface RefineReadmeFormState {
  ok: boolean;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
  formError?: string;
  /** Free 上限到達時のみ true。 */
  quotaExceeded?: boolean;
  fields?: { goal?: string };
}

export const INITIAL_REFINE_README_FORM_STATE: RefineReadmeFormState = { ok: false };

/** `FormData` から goal を取り出してバリデーション。 */
export function parseRefineReadmeFormData(formData: FormData): {
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
