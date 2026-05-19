'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/errors';
import { deleteChecklistItem } from '@/lib/api/workspaces';

export interface DeleteChecklistItemFormState {
  ok: boolean;
  formError?: string;
}

/**
 * ChecklistItem を削除する Server Action。
 *
 * サブタスク(`parentId` 経由の子)は API 側で Cascade 削除される。UI 側は確認ダイアログで
 * 影響範囲(サブタスク件数)を表示してから submit する想定。
 */
export async function deleteChecklistItemAction(
  slug: string,
  projectId: string,
  itemId: string,
  _prev: DeleteChecklistItemFormState,
  _formData: FormData,
): Promise<DeleteChecklistItemFormState> {
  void _prev;
  void _formData;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  try {
    await deleteChecklistItem(slug, projectId, itemId);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return { ok: false, formError: 'この項目を削除する権限がありません。' };
      }
      if (e.status === 404) {
        return { ok: false, formError: '項目が見つかりません。' };
      }
      return { ok: false, formError: `項目の削除に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/checklist`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  return { ok: true };
}
