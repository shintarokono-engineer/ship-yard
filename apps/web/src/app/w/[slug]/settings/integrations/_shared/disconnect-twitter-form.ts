/**
 * Twitter アカウント切断 Server Action の共有型・定数(ADR-014)。
 *
 * Next.js 15 の `'use server'` ファイルは **async 関数のみ export 可能** なので、
 * 型 / 定数は本ファイル(通常の module)に分離する。
 */

export interface DisconnectTwitterFormState {
  ok: boolean;
  formError?: string;
}

export const INITIAL_DISCONNECT_TWITTER_FORM_STATE: DisconnectTwitterFormState = {
  ok: false,
};
