/**
 * Twitter OAuth 開始 Server Action の共有型・定数(ADR-014)。
 *
 * Next.js 15 の `'use server'` ファイルは **async 関数のみ export 可能** なので、
 * 型 / 定数は本ファイル(通常の module)に分離する。既存 `readme/_actions/generate-readme.ts` +
 * `readme/_shared/generate-readme-form.ts` と同じ分離パターン。
 */

export interface InitiateTwitterOAuthFormState {
  ok: boolean;
  formError?: string;
}

export const INITIAL_INITIATE_TWITTER_OAUTH_FORM_STATE: InitiateTwitterOAuthFormState = {
  ok: false,
};
