'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/errors';
import { setLandingPagePublished } from '@/lib/api/workspaces';

import { type TogglePublishState } from '../_shared/toggle-publish-state';

/**
 * LP の公開状態を切り替える Server Action(ADR-009 Day 33)。
 *
 * `published` は切り替え後の目標状態(公開トグルコンポーネントが `!現在の状態` を bind する)。
 * 成功時は redirect せず `revalidatePath` でプレビューページを再描画する(バッジ・ボタンが反転)。
 */
export async function togglePublishAction(
  slug: string,
  projectId: string,
  published: boolean,
  _prev: TogglePublishState,
): Promise<TogglePublishState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: '認証が必要です。再度サインインしてください。' };
  }

  try {
    await setLandingPagePublished(slug, projectId, published);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return { ok: false, error: 'ランディングページを公開する権限がありません。' };
      }
      if (e.status === 404) {
        return { ok: false, error: 'ランディングページが見つかりません。' };
      }
      return { ok: false, error: `公開状態の更新に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/landing-page`);
  return { ok: true };
}
