import { cache } from 'react';

import { apiFetch } from './client';
import { ApiError, nullOnNotFound } from './errors';
import type { BillingDetail, PaidPlan } from './types';

/**
 * `GET /workspaces/:slug/billing`(OWNER のみ閲覧可)。
 *
 * Subscription 詳細(plan / status / currentPeriodEnd / canceledAt)を返す。OWNER 以外は API が 403、
 * 未所属 / slug 不在は 404 を返すので、ここでは null に変換する(呼び出し側で「権限なし」を表示)。
 *
 * `React.cache` でラップしてあるので、同一リクエスト内で重複呼び出しは dedup される。
 */
export const fetchBilling = cache(async (slug: string): Promise<BillingDetail | null> => {
  try {
    return await apiFetch<BillingDetail>(`/workspaces/${encodeURIComponent(slug)}/billing`);
  } catch (e) {
    // 403(OWNER 以外)は「請求情報を見せない」が正しい挙動なので null に倒す。
    // 401 は nullOnNotFound が SessionExpiredError に変換する(404 と混同しない)。
    if (e instanceof ApiError && e.status === 403) return null;
    return nullOnNotFound(e);
  }
});

/**
 * `POST /workspaces/:slug/portal-session`(OWNER のみ)。
 *
 * Stripe Customer Portal Session を作成し、リダイレクト先 URL を返す。
 * Server Action から呼び出し、返却 URL に `redirect()` する想定。
 */
export async function createPortalSession(slug: string): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(`/workspaces/${encodeURIComponent(slug)}/portal-session`, {
    method: 'POST',
  });
}

/**
 * `POST /workspaces/:slug/checkout-session`(OWNER のみ)。
 *
 * 指定した有料プランの Stripe Checkout Session を作成し、リダイレクト先 URL を返す。
 * Server Action から呼び出し、返却 URL に `redirect()` する想定。
 *
 * **Subscription を持たないテナント専用**(トライアル終了 / 解約後の `plan = FREE`)。
 * 有効な Subscription があるテナントのプラン変更に使うと Stripe 側で二重契約になるため、
 * その場合は Customer Portal(`createPortalSession`)を使う(ADR-004 / ADR-012)。
 */
export async function createCheckoutSession(
  slug: string,
  plan: PaidPlan,
): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(`/workspaces/${encodeURIComponent(slug)}/checkout-session`, {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}
