/**
 * README 編集フォームで共有する型・定数・ヘルパー。
 *
 * §9.12.4(2026-05-29)で `documents/[documentId]/_shared/document-form.ts` から README 専用に
 * 移植。`'use server'` ファイルから export できない定数・型・同期関数をここに集約し、各 Server
 * Action から import する。
 */

/** title の最大長(apps/api `UpdateProjectDocumentDto` と一致)。 */
export const TITLE_MAX_LENGTH = 200;
/** content の最大長(apps/api `UpdateProjectDocumentDto` と一致)。 */
export const CONTENT_MAX_LENGTH = 200_000;

/**
 * バリデーション対象フィールド。`type` は不変(編集で type 変更不可、新規 type は AI 経由で別 doc 作成)。
 */
export const FORM_FIELDS = ['title', 'content'] as const;
export type FieldName = (typeof FORM_FIELDS)[number];

/** Server Action の戻り値。Project/Checklist と同じ shape。 */
export interface ReadmeFormState {
  ok: boolean;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
  formError?: string;
  fields?: { title?: string; content?: string };
}

export const INITIAL_README_FORM_STATE: ReadmeFormState = { ok: false };

/**
 * `FormData` から title / content を取り出し、バリデーションを行う。
 *
 * UI 側のルール: **title は必須**、content は自由入力(空のままでも保存可)。
 */
export function parseReadmeFormData(formData: FormData): {
  data: { title: string | undefined; content: string | undefined } | null;
  fieldErrors: Partial<Record<FieldName, string[]>>;
  fields: { title: string; content: string };
} {
  const titleRaw = String(formData.get('title') ?? '');
  const contentRaw = String(formData.get('content') ?? '');
  // title は trim、content はインデント保持のため末尾改行のみ trim。
  const title = titleRaw.trim();
  const content = contentRaw.replace(/\s+$/, '');

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
  if (content.length > CONTENT_MAX_LENGTH) {
    pushFieldError(
      fieldErrors,
      'content',
      `本文は ${CONTENT_MAX_LENGTH.toLocaleString()} 文字以内で入力してください。`,
    );
  }

  const fields = { title, content };

  if (Object.keys(fieldErrors).length > 0) {
    return { data: null, fieldErrors, fields };
  }
  return {
    data: {
      title,
      content: content.length > 0 ? content : undefined,
    },
    fieldErrors,
    fields,
  };
}

/** `fieldErrors` への push ヘルパー。 */
export function pushFieldError(
  bag: Partial<Record<FieldName, string[]>>,
  field: FieldName,
  message: string,
): void {
  (bag[field] ??= []).push(message);
}

/**
 * NestJS `class-validator` の既定メッセージはフィールド名で始まるので、先頭トークンで
 * フィールドエラー / 全体エラーに振り分ける。
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
