/**
 * RAG_QA 質問送信 Server Action で共有する型・定数・同期パース。
 *
 * `'use server'` ファイルから値を export できない制約のため、定数・型・パースは
 * このファイルに集約する(`_shared/*-form.ts` パターン)。
 */

/** 質問本文の最大長(apps/api `RAG_QA_MAX_MESSAGE_LENGTH` と同期)。 */
export const QUESTION_MAX_LENGTH = 8000;

export interface AskMessageFormState {
  ok: boolean;
  /** 入力 / 認証 / 権限 / サーバーいずれのエラーもここに集約。 */
  formError?: string;
  /** Free 上限到達時のみ true(課金導線の出し分け用)。 */
  quotaExceeded?: boolean;
}

export const INITIAL_ASK_MESSAGE_FORM_STATE: AskMessageFormState = { ok: false };

/** `FormData` から question を取り出してバリデーション。 */
export function parseAskMessageFormData(formData: FormData): {
  question: string;
  fieldError?: string;
} {
  const question = String(formData.get('question') ?? '').trim();
  if (question.length === 0) {
    return { question, fieldError: '質問を入力してください。' };
  }
  if (question.length > QUESTION_MAX_LENGTH) {
    return {
      question,
      fieldError: `質問は ${QUESTION_MAX_LENGTH.toLocaleString()} 文字以内で入力してください。`,
    };
  }
  return { question };
}
