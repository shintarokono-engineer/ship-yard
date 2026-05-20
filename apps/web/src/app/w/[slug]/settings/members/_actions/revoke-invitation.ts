'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { revokeInvitation } from '@/lib/api/invitations';
import { ApiError } from '@/lib/api/errors';

export interface RevokeInvitationState {
  ok: boolean;
  formError?: string;
}

/**
 * 招待取り消し Server Action。
 *
 * BE 側 `DELETE /workspaces/:slug/invitations/:id` は論理削除(`revokedAt` セット)。
 * - 403(非 ADMIN) / 404(別テナント or 未存在) / 409(受諾済み or 既に取り消し済み)
 */
export async function revokeInvitationAction(
  slug: string,
  invitationId: string,
  _prev: RevokeInvitationState,
  _formData: FormData,
): Promise<RevokeInvitationState> {
  void _prev;
  void _formData;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  try {
    await revokeInvitation(slug, invitationId);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) return { ok: false, formError: '招待を取り消す権限がありません。' };
      if (e.status === 404) return { ok: false, formError: '招待が見つかりません。' };
      if (e.status === 409) {
        return {
          ok: false,
          formError: 'この招待は既に取り消されているか、受諾済みです。',
        };
      }
      return { ok: false, formError: `招待の取り消しに失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/settings/members`);
  return { ok: true };
}
