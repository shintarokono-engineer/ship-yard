/**
 * CHECKLIST_GEN(チェックリスト一括生成)Server Action で共有する型・定数・ヘルパー。
 *
 * `'use server'` ファイルから値を export できない制約があるため、定数・型・同期パースは
 * このファイルに集約する(Day 19 以降の `_shared/*-form.ts` パターン)。
 */

import { INSTRUCTIONS_MAX_LENGTH } from '@/app/w/[slug]/_shared/ai-form';
import { CATEGORIES, type Category } from '@/lib/api/types';

export { INSTRUCTIONS_MAX_LENGTH };

export const FORM_FIELDS = ['instructions', 'categories'] as const;
export type FieldName = (typeof FORM_FIELDS)[number];

export interface GenerateChecklistFormState {
  ok: boolean;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
  formError?: string;
  /** Free 上限到達時のみ true。 */
  quotaExceeded?: boolean;
  /** 成功時に生成された件数。トースト表示に使う。 */
  generatedCount?: number;
  fields?: { instructions?: string; categories?: Category[] };
}

export const INITIAL_GENERATE_CHECKLIST_FORM_STATE: GenerateChecklistFormState = { ok: false };

/**
 * `FormData` から instructions / categories を取り出してバリデーション。
 *
 * categories は checkbox の `formData.getAll('categories')` から取得。
 * 「全選択 = キーを送らない(= 未指定 = 全カテゴリ)」というルールにし、空配列は API 400 になる
 * 前に UI 側でエラー化する(submit ボタン disabled だが念のため)。
 */
export function parseGenerateChecklistFormData(formData: FormData): {
  instructions: string | undefined;
  categories: Category[] | undefined;
  fieldErrors: Partial<Record<FieldName, string[]>>;
  fields: { instructions: string; categories: Category[] };
} {
  const instructionsRaw = String(formData.get('instructions') ?? '').replace(/\s+$/, '');
  const categoriesRaw = formData.getAll('categories').map(String);
  const known: ReadonlySet<string> = new Set(CATEGORIES);
  const categories = categoriesRaw.filter((c): c is Category => known.has(c));

  const fieldErrors: Partial<Record<FieldName, string[]>> = {};

  if (instructionsRaw.length > INSTRUCTIONS_MAX_LENGTH) {
    fieldErrors.instructions = [
      `追加プロンプトは ${INSTRUCTIONS_MAX_LENGTH.toLocaleString()} 文字以内で入力してください。`,
    ];
  }

  if (categories.length === 0) {
    fieldErrors.categories = ['カテゴリを 1 つ以上選択してください。'];
  }

  // 全カテゴリ選択 = API には未指定で投げる(空配列ではなくキー自体を送らない)。
  const allSelected = categories.length === CATEGORIES.length;

  return {
    instructions: instructionsRaw.length > 0 ? instructionsRaw : undefined,
    categories: allSelected ? undefined : categories,
    fieldErrors,
    fields: { instructions: instructionsRaw, categories },
  };
}
