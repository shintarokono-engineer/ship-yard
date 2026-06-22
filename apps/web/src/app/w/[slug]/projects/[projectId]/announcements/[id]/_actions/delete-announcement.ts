'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { deleteAnnouncement } from '@/lib/api/announcements';
import { ApiError } from '@/lib/api/errors';

export interface DeleteAnnouncementFormState {
  ok: boolean;
  formError?: string;
}

export const INITIAL_DELETE_ANNOUNCEMENT_FORM_STATE: DeleteAnnouncementFormState = { ok: false };

/**
 * Announcement を削除する Server Action(ADR-014)。
 * 関連 Delivery / BlogPost は DB の onDelete: Cascade で連鎖削除される。
 * 成功時は一覧ページに redirect する。
 */
export async function deleteAnnouncementAction(
  slug: string,
  projectId: string,
  id: string,
  _prev: DeleteAnnouncementFormState,
  _formData: FormData,
): Promise<DeleteAnnouncementFormState> {
  void _prev;
  void _formData;
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  try {
    await deleteAnnouncement(slug, projectId, id);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return { ok: false, formError: 'この告知を削除する権限がありません。' };
      }
      if (e.status === 404) {
        // 既に削除済 — 一覧へ戻して整合性を取る(冪等)。
        revalidatePath(`/w/${slug}/projects/${projectId}/announcements`);
        redirect(`/w/${slug}/projects/${projectId}/announcements`);
      }
      return {
        ok: false,
        formError: `告知の削除に失敗しました (HTTP ${e.status})`,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/announcements`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  redirect(`/w/${slug}/projects/${projectId}/announcements`);
}
