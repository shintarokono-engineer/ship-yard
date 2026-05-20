'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { updateMemberRole } from '@/lib/api/members';
import { NON_OWNER_ROLES, type NonOwnerRole } from '@/lib/api/types';
import { ApiError } from '@/lib/api/errors';

export interface UpdateMemberRoleState {
  ok: boolean;
  formError?: string;
}

/**
 * メンバーのロール変更 Server Action。
 *
 * `useTransition` から直接呼ぶ想定(`useActionState` は使わない、select の onChange 即時送信)。
 * BE 側は actor / target / role の組み合わせで複数の 403 を返しうるが、UI 側では文言を統一する。
 * - 401(認証) / 403(自分のロール変更 / OWNER 操作 / ADMIN→ADMIN / 権限不足) / 404(対象未存在)
 */
export async function updateMemberRoleAction(
  slug: string,
  targetUserId: string,
  newRoleRaw: string,
): Promise<UpdateMemberRoleState> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  if (!(NON_OWNER_ROLES as readonly string[]).includes(newRoleRaw)) {
    return { ok: false, formError: '無効なロールが指定されました。' };
  }
  const newRole = newRoleRaw as NonOwnerRole;

  try {
    await updateMemberRole(slug, targetUserId, newRole);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return {
          ok: false,
          formError:
            'このロール変更は許可されていません(自分自身 / OWNER / 同階層 ADMIN への変更は不可)。',
        };
      }
      if (e.status === 404) return { ok: false, formError: 'メンバーが見つかりません。' };
      return { ok: false, formError: `ロールの変更に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/settings/members`);
  return { ok: true };
}
