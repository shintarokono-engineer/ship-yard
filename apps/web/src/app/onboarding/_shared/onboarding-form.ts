/**
 * `/onboarding`(初回テナント作成フロー)Server Action で共有する型・定数・ヘルパー。
 * `'use server'` ファイルから export できない値を集約する(Day 19 以降のパターン)。
 */

/** name の長さ範囲(apps/api `CreateWorkspaceDto` と一致)。 */
export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 50;

/** slug の長さ範囲(apps/api `CreateWorkspaceDto` と一致)。 */
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 30;

/** slug の許容文字パターン(apps/api `CreateWorkspaceDto` の `@Matches` と一致、小文字英数 + ハイフン)。 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const FORM_FIELDS = ['name', 'slug'] as const;
export type FieldName = (typeof FORM_FIELDS)[number];

export interface OnboardingFormState {
  ok: boolean;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
  formError?: string;
  fields?: { name?: string; slug?: string };
}

export const INITIAL_ONBOARDING_FORM_STATE: OnboardingFormState = { ok: false };

/**
 * `FormData` から name / slug を取り出してバリデーション。
 *
 * - name は必須(3〜50 文字、trim 後)
 * - slug は任意(空なら自動生成、入力ありなら 3〜30 文字 + パターン検証)
 */
export function parseOnboardingFormData(formData: FormData): {
  data: { name: string; slug: string | undefined } | null;
  fieldErrors: Partial<Record<FieldName, string[]>>;
  fields: { name: string; slug: string };
} {
  const name = String(formData.get('name') ?? '').trim();
  const slug = String(formData.get('slug') ?? '')
    .trim()
    .toLowerCase();

  const fieldErrors: Partial<Record<FieldName, string[]>> = {};

  if (name.length < NAME_MIN_LENGTH) {
    fieldErrors.name = [`ワークスペース名は ${NAME_MIN_LENGTH} 文字以上で入力してください。`];
  } else if (name.length > NAME_MAX_LENGTH) {
    fieldErrors.name = [`ワークスペース名は ${NAME_MAX_LENGTH} 文字以内で入力してください。`];
  }

  if (slug.length > 0) {
    if (slug.length < SLUG_MIN_LENGTH) {
      (fieldErrors.slug ??= []).push(`URL は ${SLUG_MIN_LENGTH} 文字以上で入力してください。`);
    } else if (slug.length > SLUG_MAX_LENGTH) {
      (fieldErrors.slug ??= []).push(`URL は ${SLUG_MAX_LENGTH} 文字以内で入力してください。`);
    }
    if (!SLUG_PATTERN.test(slug)) {
      (fieldErrors.slug ??= []).push('URL は小文字英数字とハイフンのみ使用できます(例: my-team)。');
    }
  }

  const fields = { name, slug };

  if (Object.keys(fieldErrors).length > 0) {
    return { data: null, fieldErrors, fields };
  }

  return {
    data: { name, slug: slug.length > 0 ? slug : undefined },
    fieldErrors,
    fields,
  };
}

/** API の class-validator メッセージを field に振り分けるヘルパー。 */
export function classifyApiMessages(messages: string[]): {
  fieldErrors: Partial<Record<FieldName, string[]>>;
  formErrors: string[];
} {
  const knownFields: ReadonlySet<string> = new Set(FORM_FIELDS);
  const fieldErrors: Partial<Record<FieldName, string[]>> = {};
  const formErrors: string[] = [];
  for (const msg of messages) {
    const firstToken = msg.split(/\s+/)[0]?.toLowerCase();
    if (firstToken && knownFields.has(firstToken)) {
      (fieldErrors[firstToken as FieldName] ??= []).push(msg);
    } else {
      formErrors.push(msg);
    }
  }
  return { fieldErrors, formErrors };
}
