'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { acceptInvitation } from '@/lib/api/invitations';
import { ApiError } from '@/lib/api/errors';

export interface AcceptInvitationFormState {
  ok: boolean;
  formError?: string;
  /** メール不一致時に表示するヒント(招待先メール)。 */
  expectedEmail?: string;
}

const INITIAL_STATE: AcceptInvitationFormState = { ok: false };
export { INITIAL_STATE as INITIAL_ACCEPT_INVITATION_STATE };

/**
 * 招待承諾 Server Action。成功時は `/w/{workspaceSlug}` へ redirect。
 *
 * エラー振り分け(API 側の HTTP コード):
 * - 401: 未認証(`/sign-in?redirect_url=/invite/{token}` に redirect)
 * - 404: token 不在(「招待リンクが見つかりません」)
 * - 410 Gone: 期限切れ or 取り消し済み
 * - 409 Conflict: 受諾済み
 * - 403: メール不一致(「招待されたメールアドレスでサインインしてください」)
 */
export async function acceptInvitationAction(
  token: string,
  _prev: AcceptInvitationFormState,
  _formData: FormData,
): Promise<AcceptInvitationFormState> {
  void _prev;
  void _formData;

  const { userId } = await auth();
  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/invite/${token}`)}`);
  }

  let workspaceSlug: string;
  try {
    const res = await acceptInvitation(token);
    workspaceSlug = res.workspaceSlug;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 404) {
        return { ok: false, formError: '招待リンクが見つかりません。' };
      }
      if (e.status === 410) {
        return {
          ok: false,
          formError:
            'この招待リンクは期限切れ、または取り消されました。招待者に再送を依頼してください。',
        };
      }
      if (e.status === 409) {
        return { ok: false, formError: 'この招待はすでに承諾されています。' };
      }
      if (e.status === 403) {
        return {
          ok: false,
          formError: '招待されたメールアドレスでサインインしてください。',
        };
      }
      return { ok: false, formError: `招待の承諾に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }

  revalidatePath('/');
  redirect(`/w/${workspaceSlug}`);
}
