import { cache } from 'react';

import { apiFetch } from './client';
import { ApiError } from './errors';
import type { AcceptInvitationResult, InvitationDetail } from './types';

/**
 * `GET /invitations/:token`(未認証可)。
 *
 * 期限切れ / 取り消し済み / 受諾済みでも 200 で `status` フラグ付きで返るので、フロント側で
 * 状態ごとに表示分岐する(承諾ボタン / エラーメッセージ)。不在のみ 404。
 *
 * `React.cache` で同一リクエスト内 dedup。`skipAuth: true` で Clerk JWT を付けずに叩く。
 */
export const fetchInvitation = cache(async (token: string): Promise<InvitationDetail | null> => {
  try {
    return await apiFetch<InvitationDetail>(`/invitations/${encodeURIComponent(token)}`, {
      skipAuth: true,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
});

/**
 * `POST /invitations/:token/accept`(認証必須)。
 *
 * - 404 (token 不在) / 410 Gone (期限切れ or 取り消し済み) / 409 (受諾済み) / 403 (email 不一致)
 * - 成功時は `{ tenantId, workspaceSlug, workspaceName, role }` を返す(UI が `/w/{slug}` へ遷移)
 */
export async function acceptInvitation(token: string): Promise<AcceptInvitationResult> {
  return apiFetch<AcceptInvitationResult>(`/invitations/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
  });
}
