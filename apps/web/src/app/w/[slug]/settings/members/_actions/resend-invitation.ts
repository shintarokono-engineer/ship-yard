'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { resendInvitation } from '@/lib/api/invitations';
import { ApiError } from '@/lib/api/errors';

export interface ResendInvitationState {
  ok: boolean;
  mailSent?: boolean;
  invitedEmail?: string;
  formError?: string;
}

/**
 * 招待再送 Server Action。
 *
 * BE 側は既存トークンを `revokedAt` で論理削除 → 新トークン + 新 expiresAt(7 日)を発行 + メール送信。
 * メール送信失敗時は `mailSent: false` を返す(招待発行と同じ扱い)。
 * - 403(非 ADMIN) / 404(別テナント or 未存在) / 409(受諾済み or 取り消し済み)
 */
export async function resendInvitationAction(
  slug: string,
  invitationId: string,
  _prev: ResendInvitationState,
  _formData: FormData,
): Promise<ResendInvitationState> {
  void _prev;
  void _formData;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  let mailSent: boolean;
  let invitedEmail: string;
  try {
    const result = await resendInvitation(slug, invitationId);
    mailSent = result.mailSent;
    invitedEmail = result.invitation.email;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) return { ok: false, formError: '招待を再送する権限がありません。' };
      if (e.status === 404) return { ok: false, formError: '招待が見つかりません。' };
      if (e.status === 409) {
        return {
          ok: false,
          formError: 'この招待は受諾済みまたは取り消し済みのため再送できません。新規に招待し直してください。',
        };
      }
      return { ok: false, formError: `招待の再送に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/settings/members`);
  return { ok: true, mailSent, invitedEmail };
}
