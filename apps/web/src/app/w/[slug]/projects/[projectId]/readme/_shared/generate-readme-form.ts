/**
 * DRAFT_GEN(README の AI ドラフト生成)Server Action で共有する型・定数・ヘルパー。
 *
 * §9.12.4(2026-05-29)で `documents/_shared/generate-document-form.ts` から README 専用に移植
 * (docType は README 固定なので kind 選択スキーマを削除)。`'use server'` ファイルから export できない
 * 定数・型・同期パースはここに集約。
 */

import { INSTRUCTIONS_MAX_LENGTH } from '@/app/w/[slug]/_shared/ai-form';

export { INSTRUCTIONS_MAX_LENGTH };

export const FORM_FIELDS = ['instructions'] as const;
export type FieldName = (typeof FORM_FIELDS)[number];

export interface GenerateReadmeFormState {
  ok: boolean;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
  formError?: string;
  /** Free 上限到達時のみ true。UI 側で Pro 誘導 CTA を出す分岐に使う。 */
  quotaExceeded?: boolean;
  fields?: { instructions?: string };
}

export const INITIAL_GENERATE_README_FORM_STATE: GenerateReadmeFormState = { ok: false };

/**
 * `FormData` から instructions を取り出して、長さチェックのみ行う。
 * instructions は任意なので空でも OK(API 側でも `@IsOptional`)。
 */
export function parseGenerateReadmeFormData(formData: FormData): {
  instructions: string | undefined;
  fieldErrors: Partial<Record<FieldName, string[]>>;
  fields: { instructions: string };
} {
  const raw = String(formData.get('instructions') ?? '').replace(/\s+$/, '');
  const fieldErrors: Partial<Record<FieldName, string[]>> = {};

  if (raw.length > INSTRUCTIONS_MAX_LENGTH) {
    fieldErrors.instructions = [
      `追加プロンプトは ${INSTRUCTIONS_MAX_LENGTH.toLocaleString()} 文字以内で入力してください。`,
    ];
  }

  return {
    instructions: raw.length > 0 ? raw : undefined,
    fieldErrors,
    fields: { instructions: raw },
  };
}
