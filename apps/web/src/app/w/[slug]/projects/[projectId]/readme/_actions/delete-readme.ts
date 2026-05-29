'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError } from '@/lib/api/errors';
import { deleteDocument } from '@/lib/api/workspaces';

export interface DeleteReadmeFormState {
  ok: boolean;
  formError?: string;
}

/**
 * README の特定 version を soft delete する Server Action。
 *
 * §9.12.4(2026-05-29)で `documents/[documentId]/_actions/delete-document.ts` から README 専用に移植。
 * 行単位の soft delete(`deletedAt` に UTC now)。物理削除ではないので DB レベルでは復旧可能。
 * 成功時は Project 詳細に redirect(README ページは最新 version が無くなるケースをそこから再判断する)。
 */
export async function deleteReadmeAction(
  slug: string,
  projectId: string,
  documentId: string,
  _prev: DeleteReadmeFormState,
  _formData: FormData,
): Promise<DeleteReadmeFormState> {
  void _prev;
  void _formData;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  try {
    await deleteDocument(slug, projectId, documentId);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return { ok: false, formError: 'この README を削除する権限がありません。' };
      }
      if (e.status === 404) {
        return { ok: false, formError: 'README が見つかりません。' };
      }
      return { ok: false, formError: `README の削除に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/readme`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  redirect(`/w/${slug}/projects/${projectId}`);
}
