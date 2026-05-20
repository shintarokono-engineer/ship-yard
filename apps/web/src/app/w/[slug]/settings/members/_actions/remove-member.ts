'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { removeMember } from '@/lib/api/members';
import { ApiError } from '@/lib/api/errors';

export interface RemoveMemberState {
  ok: boolean;
  formError?: string;
}

/**
 * メンバー削除 Server Action(自己退会も同経路)。
 *
 * `isSelfWithdrawal` は呼び出し側(Server Component)が `member.userId === currentUserId` で
 * 判定して bind する。`true` の場合は成功時に `/` へリダイレクトし、ワークスペース一覧 or
 * オンボーディング画面に逃がす。`false` の場合は `revalidatePath` で一覧を更新するだけ。
 *
 * BE 側で多段の認可がかかる:
 * - 対象 = OWNER → 403(自他問わず)
 * - 他者削除は OWNER/ADMIN のみ可、ADMIN→ADMIN は不可 → 403
 * - 対象未存在 → 404
 */
export async function removeMemberAction(
  slug: string,
  targetUserId: string,
  isSelfWithdrawal: boolean,
  _prev: RemoveMemberState,
  _formData: FormData,
): Promise<RemoveMemberState> {
  void _prev;
  void _formData;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  try {
    await removeMember(slug, targetUserId);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return {
          ok: false,
          formError: isSelfWithdrawal
            ? 'オーナーは退会できません。所有権の譲渡が必要です。'
            : 'このメンバーを削除する権限がありません。',
        };
      }
      if (e.status === 404) return { ok: false, formError: 'メンバーが見つかりません。' };
      return { ok: false, formError: `メンバーの削除に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }

  if (isSelfWithdrawal) {
    // 自己退会成功 → 所属が無くなったので root に逃がす。root 側で `listMyWorkspaces` が
    // 最新状態を引き、他に所属があればそちらへ、無ければオンボーディングへ誘導する。
    redirect('/');
  }

  revalidatePath(`/w/${slug}/settings/members`);
  return { ok: true };
}
