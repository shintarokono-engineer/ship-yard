'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import type { LpBlock } from '@/lib/api/types';
import { updateLandingPage } from '@/lib/api/workspaces';

import { type UpdateLpState } from '../_shared/lp-edit';

export type { UpdateLpState } from '../_shared/lp-edit';

/**
 * LP ブロック編集(ADR-009、Day 32)の保存 Server Action。
 *
 * 編集 UI が保持する `LpBlock[]` を `useActionState` 経由でそのまま受け取る(FormData ではない)。
 * 成功時はプレビューページへ redirect する(編集 UI はそこで unmount される)。
 */
export async function updateLandingPageAction(
  slug: string,
  projectId: string,
  _prev: UpdateLpState,
  blocks: LpBlock[],
): Promise<UpdateLpState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  try {
    await updateLandingPage(slug, projectId, { blocks });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return { ok: false, formError: 'ランディングページを編集する権限がありません。' };
      }
      if (e.status === 404) {
        return { ok: false, formError: 'ランディングページが見つかりません。' };
      }
      if (e.status === 400) {
        const messages = extractValidationMessages(e.body);
        return { ok: false, formError: messages.join(' / ') || 'リクエストが不正です。' };
      }
      return { ok: false, formError: `保存に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/landing-page`);
  redirect(`/w/${slug}/projects/${projectId}/landing-page`);
}
