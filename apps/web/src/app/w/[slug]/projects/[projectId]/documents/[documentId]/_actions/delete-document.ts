'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError } from '@/lib/api/errors';
import { deleteDocument } from '@/lib/api/workspaces';

export interface DeleteDocumentFormState {
  ok: boolean;
  formError?: string;
}

/**
 * ProjectDocument を soft delete する Server Action。
 *
 * 行単位の soft delete(`deletedAt` に UTC now)。物理削除ではないので DB レベルでは復旧可能。
 * 成功時は documents 一覧へ redirect。
 */
export async function deleteDocumentAction(
  slug: string,
  projectId: string,
  documentId: string,
  _prev: DeleteDocumentFormState,
  _formData: FormData,
): Promise<DeleteDocumentFormState> {
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
        return { ok: false, formError: 'このドキュメントを削除する権限がありません。' };
      }
      if (e.status === 404) {
        return { ok: false, formError: 'ドキュメントが見つかりません。' };
      }
      return { ok: false, formError: `ドキュメントの削除に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/documents`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  redirect(`/w/${slug}/projects/${projectId}/documents`);
}
