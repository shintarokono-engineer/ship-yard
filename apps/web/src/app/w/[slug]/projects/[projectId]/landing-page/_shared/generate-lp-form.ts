/**
 * LP ブロック生成(ADR-009)Server Action で共有する型・定数・ヘルパー。
 *
 * `documents/_shared/generate-document-form.ts`(DRAFT_GEN 用)と構造は同じだが、LP は生成後に
 * 同一ページ(プレビュー)へ留まる(redirect しない)ため、成功状態を `ok: true` で返す点が異なる。
 */

import { INSTRUCTIONS_MAX_LENGTH } from '@/app/w/[slug]/_shared/ai-form';

export { INSTRUCTIONS_MAX_LENGTH };

export const FORM_FIELDS = ['instructions'] as const;
export type FieldName = (typeof FORM_FIELDS)[number];

export interface GenerateLpFormState {
  /** 生成成功時のみ true。Dialog 側はこれを見て自身を閉じる。 */
  ok: boolean;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
  formError?: string;
  /** Free 上限到達時のみ true。UI 側で Pro 誘導 CTA を出す分岐に使う。 */
  quotaExceeded?: boolean;
  fields?: { instructions?: string };
}

export const INITIAL_GENERATE_LP_FORM_STATE: GenerateLpFormState = { ok: false };

/**
 * `FormData` から instructions を取り出して、長さチェックのみ行う。
 * instructions は任意なので空でも OK(API 側でも `@IsOptional`)。
 */
export function parseGenerateLpFormData(formData: FormData): {
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
