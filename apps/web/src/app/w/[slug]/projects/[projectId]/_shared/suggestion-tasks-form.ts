/**
 * F17(改善提案 → ChecklistItem 変換)Server Action で共有する型・定数・ヘルパー。
 *
 * `'use server'` ファイルから値を export できない制約があるため、定数・型・同期パースは
 * このファイルに集約する(`checklist/_shared/generate-checklist-form.ts` と同じパターン)。
 *
 * 診断ページと検証ページの両方から使うので、`checklist/` ではなく
 * 共通の親である `projects/[projectId]/_shared/` に置く。
 */

import { INSTRUCTIONS_MAX_LENGTH } from '@/app/w/[slug]/_shared/ai-form';

export { INSTRUCTIONS_MAX_LENGTH };

export const FORM_FIELDS = ['indexes', 'instructions'] as const;
export type FieldName = (typeof FORM_FIELDS)[number];

export interface SuggestionTasksFormState {
  ok: boolean;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
  formError?: string;
  /** AI クレジット上限到達時のみ true。 */
  quotaExceeded?: boolean;
  /** 成功時に作成された件数。トースト表示に使う。 */
  generatedCount?: number;
  fields?: { indexes?: number[]; instructions?: string };
}

export const INITIAL_SUGGESTION_TASKS_FORM_STATE: SuggestionTasksFormState = { ok: false };

/**
 * `FormData` から indexes / instructions を取り出してバリデーション。
 *
 * `indexes` は checkbox の `formData.getAll('indexes')` から取得する。value は提案配列の
 * 添字なので、整数かつ 0 以上のものだけを残す(重複も潰す)。範囲の上限は API 側の DTO が
 * 保存件数から算出して検証するため、ここでは見ない。
 */
export function parseSuggestionTasksFormData(formData: FormData): {
  indexes: number[];
  instructions: string | undefined;
  fieldErrors: Partial<Record<FieldName, string[]>>;
  fields: { indexes: number[]; instructions: string };
} {
  const instructionsRaw = String(formData.get('instructions') ?? '').replace(/\s+$/, '');

  const indexes = [
    ...new Set(
      formData
        .getAll('indexes')
        .map((v) => Number(String(v)))
        .filter((n) => Number.isInteger(n) && n >= 0),
    ),
  ].sort((a, b) => a - b);

  const fieldErrors: Partial<Record<FieldName, string[]>> = {};

  if (indexes.length === 0) {
    fieldErrors.indexes = ['タスク化する提案を 1 つ以上選択してください。'];
  }

  if (instructionsRaw.length > INSTRUCTIONS_MAX_LENGTH) {
    fieldErrors.instructions = [
      `追加プロンプトは ${INSTRUCTIONS_MAX_LENGTH.toLocaleString()} 文字以内で入力してください。`,
    ];
  }

  return {
    indexes,
    instructions: instructionsRaw.length > 0 ? instructionsRaw : undefined,
    fieldErrors,
    fields: { indexes, instructions: instructionsRaw },
  };
}
