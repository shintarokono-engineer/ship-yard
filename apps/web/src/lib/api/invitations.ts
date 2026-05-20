import { cache } from 'react';

import { apiFetch } from './client';
import { ApiError } from './errors';
import type {
  AcceptInvitationResult,
  CreateInvitationResult,
  InvitationDetail,
  InvitationListItem,
  NonOwnerRole,
} from './types';

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

/**
 * `POST /workspaces/:slug/invitations`(OWNER/ADMIN)— 招待発行。
 *
 * メール送信は BE 側でベストエフォート(ADR-007)。失敗しても招待トークン自体は作られ、
 * `mailSent: false` がレスポンスに含まれる。UI は toast 等で通知し、招待一覧の「再送」で拾える。
 */
export async function createInvitation(
  slug: string,
  body: { email: string; role: NonOwnerRole },
): Promise<CreateInvitationResult> {
  return apiFetch<CreateInvitationResult>(
    `/workspaces/${encodeURIComponent(slug)}/invitations`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

/**
 * `GET /workspaces/:slug/invitations`(OWNER/ADMIN)— 招待一覧。
 *
 * 受諾済み / 取り消し済み / 期限切れも含めて全件返り、`status` で 4 状態に分かれる。
 * 非 ADMIN は 403 になるので、呼び出し側で先に `isAdminRole` で分岐する。
 */
export async function listInvitations(slug: string): Promise<InvitationListItem[]> {
  return apiFetch<InvitationListItem[]>(
    `/workspaces/${encodeURIComponent(slug)}/invitations`,
  );
}

/**
 * `DELETE /workspaces/:slug/invitations/:id`(OWNER/ADMIN)— 招待取り消し。論理削除(204)。
 *
 * - 別テナント / 未存在 → 404
 * - 受諾済み / 既に取り消し済み → 409
 */
export async function revokeInvitation(slug: string, invitationId: string): Promise<void> {
  await apiFetch<void>(
    `/workspaces/${encodeURIComponent(slug)}/invitations/${encodeURIComponent(invitationId)}`,
    { method: 'DELETE' },
  );
}

/**
 * `POST /workspaces/:slug/invitations/:id/resend`(OWNER/ADMIN)— 招待再送。
 *
 * 既存 token を revoke し、新 token + expiresAt 7 日で再発行 + メール送信。
 * - 別テナント / 未存在 → 404
 * - 受諾済み / 取り消し済み → 409
 * - メール送信失敗は `mailSent: false` で 201 を返す(招待発行と同じ扱い)
 */
export async function resendInvitation(
  slug: string,
  invitationId: string,
): Promise<CreateInvitationResult> {
  return apiFetch<CreateInvitationResult>(
    `/workspaces/${encodeURIComponent(slug)}/invitations/${encodeURIComponent(invitationId)}/resend`,
    { method: 'POST' },
  );
}
