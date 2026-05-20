/**
 * TASK_SPLIT(親 ChecklistItem の AI 分解)Server Action で共有する型・定数・ヘルパー。
 *
 * `'use server'` ファイルから値を export できない制約のため、定数・型・同期パースはここに集約。
 */

import { INSTRUCTIONS_MAX_LENGTH } from '@/app/w/[slug]/_shared/ai-form';

export { INSTRUCTIONS_MAX_LENGTH };

export const FORM_FIELDS = ['instructions'] as const;
export type FieldName = (typeof FORM_FIELDS)[number];

export interface SplitTaskFormState {
  ok: boolean;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
  formError?: string;
  /** Free 上限到達時のみ true。 */
  quotaExceeded?: boolean;
  /** 成功時に生成された件数。トースト表示に使う。 */
  generatedCount?: number;
  fields?: { instructions?: string };
}

export const INITIAL_SPLIT_TASK_FORM_STATE: SplitTaskFormState = { ok: false };

/** `FormData` から instructions を取り出してバリデーション。 */
export function parseSplitTaskFormData(formData: FormData): {
  instructions: string | undefined;
  fieldErrors: Partial<Record<FieldName, string[]>>;
  fields: { instructions: string };
} {
  const instructionsRaw = String(formData.get('instructions') ?? '').replace(/\s+$/, '');

  const fieldErrors: Partial<Record<FieldName, string[]>> = {};

  if (instructionsRaw.length > INSTRUCTIONS_MAX_LENGTH) {
    fieldErrors.instructions = [
      `追加プロンプトは ${INSTRUCTIONS_MAX_LENGTH.toLocaleString()} 文字以内で入力してください。`,
    ];
  }

  return {
    instructions: instructionsRaw.length > 0 ? instructionsRaw : undefined,
    fieldErrors,
    fields: { instructions: instructionsRaw },
  };
}
