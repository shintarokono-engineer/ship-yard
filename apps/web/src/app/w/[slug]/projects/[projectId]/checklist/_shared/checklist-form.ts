/**
 * ChecklistItem 作成 / 編集 フォームで共有する型・定数・ヘルパー。
 *
 * Day 19 の `_shared/project-form.ts` と同じ思想:`'use server'` ファイルから export できない
 * 定数・型・同期関数をここに集約し、各 Server Action から import する。
 */

import { CATEGORIES, ITEM_STATUSES, type Category, type ItemStatus } from '@/lib/api/types';

/** title の最大長(apps/api `CreateChecklistItemDto` / `UpdateChecklistItemDto` と一致)。 */
export const TITLE_MAX_LENGTH = 200;
/** description の最大長。 */
export const DESCRIPTION_MAX_LENGTH = 20_000;

/**
 * バリデーション対象フィールド。
 * `parentId` は UI から変更経路が無い(create 時のみ bind 引数で渡す、ADR-005)ため含めない。
 */
export const FORM_FIELDS = ['title', 'category', 'description', 'status'] as const;
export type FieldName = (typeof FORM_FIELDS)[number];

/** Server Action の戻り値。`ProjectFormState` と同じ shape。 */
export interface ChecklistItemFormState {
  ok: boolean;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
  formError?: string;
  fields?: {
    title?: string;
    category?: string;
    description?: string;
    status?: string;
  };
}

export const INITIAL_CHECKLIST_FORM_STATE: ChecklistItemFormState = { ok: false };

/**
 * `FormData` から title / category / description / status を取り出し、バリデーションを行う。
 *
 * `requireCategory` を `true` にすると category 未指定をエラーにする(編集モーダル用)。
 * インラインフォームで category を bind で固定する場合は `false` にすれば値が無くてもエラーにならない。
 */
export function parseChecklistItemFormData(
  formData: FormData,
  options: { requireCategory?: boolean } = {},
): {
  data: {
    title: string;
    category: Category | undefined;
    description: string;
    status: ItemStatus | undefined;
  } | null;
  fieldErrors: Partial<Record<FieldName, string[]>>;
  fields: {
    title: string;
    category: string;
    description: string;
    status: string;
  };
} {
  const title = String(formData.get('title') ?? '').trim();
  const categoryRaw = String(formData.get('category') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const statusRaw = String(formData.get('status') ?? '').trim();

  const category = (CATEGORIES as readonly string[]).includes(categoryRaw)
    ? (categoryRaw as Category)
    : undefined;
  const status = (ITEM_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as ItemStatus)
    : undefined;

  const fieldErrors: Partial<Record<FieldName, string[]>> = {};
  if (title.length === 0) {
    pushFieldError(fieldErrors, 'title', 'タイトルを入力してください。');
  } else if (title.length > TITLE_MAX_LENGTH) {
    pushFieldError(
      fieldErrors,
      'title',
      `タイトルは ${TITLE_MAX_LENGTH} 文字以内で入力してください。`,
    );
  }
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    pushFieldError(
      fieldErrors,
      'description',
      `説明は ${DESCRIPTION_MAX_LENGTH} 文字以内で入力してください。`,
    );
  }
  if (options.requireCategory && !category) {
    pushFieldError(fieldErrors, 'category', 'カテゴリを選択してください。');
  }

  const fields = { title, category: categoryRaw, description, status: statusRaw };

  if (Object.keys(fieldErrors).length > 0) {
    return { data: null, fieldErrors, fields };
  }
  return { data: { title, category, description, status }, fieldErrors, fields };
}

/** `fieldErrors` への push ヘルパー(`project-form.ts` と同じ形)。 */
export function pushFieldError(
  bag: Partial<Record<FieldName, string[]>>,
  field: FieldName,
  message: string,
): void {
  (bag[field] ??= []).push(message);
}

/**
 * NestJS `class-validator` の既定メッセージはフィールド名で始まるので、先頭トークンで
 * フィールドエラー / 全体エラーに振り分ける(`project-form.ts` と同じロジック)。
 */
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
      pushFieldError(fieldErrors, firstToken as FieldName, msg);
    } else {
      formErrors.push(msg);
    }
  }
  return { fieldErrors, formErrors };
}
