/**
 * RAG_QA セッション作成 Server Action で共有する型・定数・同期パース。
 *
 * `'use server'` ファイルから値を export できない制約のため、定数・型・パースは
 * このファイルに集約する(`_shared/*-form.ts` パターン)。
 */

/** セッションタイトルの最大長(apps/api `CreateRagQaSessionDto` の `@MaxLength(100)` と同期)。 */
export const SESSION_TITLE_MAX_LENGTH = 100;

export interface CreateSessionFormState {
  ok: boolean;
  /** title フィールドのバリデーションエラー。 */
  fieldError?: string;
  /** フォーム全体のエラー(認証 / 権限 / サーバー)。 */
  formError?: string;
  /** 再表示用の入力値。 */
  title?: string;
}

export const INITIAL_CREATE_SESSION_FORM_STATE: CreateSessionFormState = { ok: false };

/** `FormData` から title を取り出してバリデーション。 */
export function parseCreateSessionFormData(formData: FormData): {
  title: string;
  fieldError?: string;
} {
  const title = String(formData.get('title') ?? '').trim();
  if (title.length === 0) {
    return { title, fieldError: 'タイトルを入力してください。' };
  }
  if (title.length > SESSION_TITLE_MAX_LENGTH) {
    return {
      title,
      fieldError: `タイトルは ${SESSION_TITLE_MAX_LENGTH} 文字以内で入力してください。`,
    };
  }
  return { title };
}
