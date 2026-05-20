/**
 * Portal Session Server Action の戻り値ステートと初期値。
 *
 * `'use server'` ファイル(`_actions.ts`)は async 関数しか export できないため、
 * 定数・型はこのファイルに分離する。
 */

export interface PortalSessionFormState {
  ok: boolean;
  error?: string;
}

export const INITIAL_PORTAL_SESSION_STATE: PortalSessionFormState = { ok: true };
