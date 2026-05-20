import { apiFetch } from './client';
import type { Member, NonOwnerRole, Role } from './types';

/**
 * `GET /workspaces/:slug/members` — メンバー一覧。
 *
 * BE 側でロール優先順(OWNER → ... → VIEWER)→ `joinedAt` 昇順に並べて返るので、
 * フロントは並び順を尊重してそのままレンダリングするだけで良い。
 */
export async function listMembers(slug: string): Promise<Member[]> {
  return apiFetch<Member[]>(`/workspaces/${encodeURIComponent(slug)}/members`);
}

/**
 * `PATCH /workspaces/:slug/members/:userId` — ロール変更。
 *
 * 認可は BE 側 `MembersService.updateRole` が判定:
 * - 自分のロール変更 → 403
 * - 対象が OWNER → 403
 * - actor が OWNER/ADMIN でない → 403
 * - ADMIN→ADMIN → 403
 * - 対象未存在 → 404
 */
export async function updateMemberRole(
  slug: string,
  userId: string,
  role: NonOwnerRole,
): Promise<{ userId: string; role: Role; joinedAt: string }> {
  return apiFetch<{ userId: string; role: Role; joinedAt: string }>(
    `/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    },
  );
}

/**
 * `DELETE /workspaces/:slug/members/:userId` — メンバー削除(自己退会も同経路)。
 *
 * 認可:
 * - 対象 = OWNER → 403
 * - 自分自身は OWNER 以外なら可
 * - 他者削除は OWNER/ADMIN のみ、ADMIN→ADMIN は不可
 * - 対象未存在 → 404
 */
export async function removeMember(slug: string, userId: string): Promise<void> {
  await apiFetch<void>(
    `/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}
