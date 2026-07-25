/**
 * Checkout Session Server Action の戻り値ステートと初期値。
 *
 * `'use server'` ファイル(`_actions.ts`)は async 関数しか export できないため、
 * 定数・型はこのファイルに分離する(`portal-session-form.ts` と同じ流儀)。
 */

export interface CheckoutSessionFormState {
  ok: boolean;
  error?: string;
}

export const INITIAL_CHECKOUT_SESSION_STATE: CheckoutSessionFormState = { ok: true };
