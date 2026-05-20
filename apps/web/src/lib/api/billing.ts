import { cache } from 'react';

import { apiFetch } from './client';
import { ApiError } from './errors';
import type { BillingDetail } from './types';

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
    if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) {
      return null;
    }
    throw e;
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
