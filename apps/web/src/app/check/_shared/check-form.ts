/**
 * `/check` の入力フォームの共有ロジック(Server Action と Client Component の両方から使う)。
 *
 * 検証を 1 か所に置き、クライアント側とサーバー側で文言がズレないようにする。
 */

/** アイデア文の文字数上限。BE の `PUBLIC_CHECK_INPUT_MAX_CHARS` と一致させること。 */
export const IDEA_TEXT_MAX_LENGTH = 2000;

/** 採点が成立する最低限の長さ。BE の `PUBLIC_CHECK_INPUT_MIN_CHARS` と一致させること。 */
export const IDEA_TEXT_MIN_LENGTH = 20;

export interface CheckFormState {
  /** フォーム全体のエラー文言。 */
  formError?: string;
  /** アイデア文のエラー文言。 */
  fieldError?: string;
  /** 上限到達時に、単なるエラーではなく登録への案内として出すためのフラグ。 */
  limitReached?: boolean;
  /** 再表示用に入力値を保持する(エラーで入力が消えるのを防ぐ)。 */
  ideaText?: string;
}

export const INITIAL_CHECK_FORM_STATE: CheckFormState = {};

/** フォームデータを検証する。`error` があれば送信しない。 */
export function parseCheckFormData(formData: FormData): {
  ideaText: string;
  error?: string;
} {
  const ideaText = String(formData.get('ideaText') ?? '').trim();

  if (ideaText.length === 0) {
    return { ideaText, error: 'アイデアを入力してください。' };
  }
  if (ideaText.length < IDEA_TEXT_MIN_LENGTH) {
    return {
      ideaText,
      error: `もう少し詳しく書いてください(${IDEA_TEXT_MIN_LENGTH} 文字以上)。誰のどんな課題を、どう解決するかが分かると精度が上がります。`,
    };
  }
  if (ideaText.length > IDEA_TEXT_MAX_LENGTH) {
    return {
      ideaText,
      error: `${IDEA_TEXT_MAX_LENGTH} 文字以内で入力してください。`,
    };
  }
  return { ideaText };
}
