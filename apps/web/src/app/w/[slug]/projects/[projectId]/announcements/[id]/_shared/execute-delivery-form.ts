/**
 * Delivery 実行 Server Action の共有型・定数(ADR-014、Next.js 15 制約対応)。
 */

export interface ExecuteDeliveryFormState {
  ok: boolean;
  formError?: string;
}

export const INITIAL_EXECUTE_DELIVERY_FORM_STATE: ExecuteDeliveryFormState = { ok: false };
