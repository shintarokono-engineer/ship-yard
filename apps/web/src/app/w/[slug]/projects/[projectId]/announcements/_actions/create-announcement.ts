'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAnnouncement } from '@/lib/api/announcements';
import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import { ANNOUNCEMENT_TITLE_MAX } from '@/lib/api/types';

import type { CreateAnnouncementFormState } from '../_shared/create-announcement-form';

/**
 * Announcement(ADR-014)新規作成 Server Action。
 *
 * MVP では `title`(内部管理用)のみ受け取り、status は API 側で `DRAFT` 固定。
 * 成功時は `/announcements/{id}` に redirect して即編集画面へ遷移する(README/LP と同じ流儀)。
 */
export async function createAnnouncementAction(
  slug: string,
  projectId: string,
  _prev: CreateAnnouncementFormState,
  formData: FormData,
): Promise<CreateAnnouncementFormState> {
  void _prev;
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const title = String(formData.get('title') ?? '').trim();
  if (!title) {
    return {
      ok: false,
      fieldErrors: { title: ['タイトルを入力してください。'] },
      fields: { title },
    };
  }
  if (title.length > ANNOUNCEMENT_TITLE_MAX) {
    return {
      ok: false,
      fieldErrors: {
        title: [`タイトルは ${ANNOUNCEMENT_TITLE_MAX} 文字以内で入力してください。`],
      },
      fields: { title },
    };
  }

  let createdId: string;
  try {
    const created = await createAnnouncement(slug, projectId, { title });
    createdId = created.id;
  } catch (e) {
    if (e instanceof ApiError) {
      const msgs = extractValidationMessages(e.body);
      if (e.status === 403) {
        return {
          ok: false,
          formError: '告知を作成する権限がありません。',
          fields: { title },
        };
      }
      if (e.status === 400 && msgs.length > 0) {
        return {
          ok: false,
          fieldErrors: { title: msgs },
          fields: { title },
        };
      }
      return {
        ok: false,
        formError: `告知の作成に失敗しました (HTTP ${e.status})`,
        fields: { title },
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/announcements`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  redirect(`/w/${slug}/projects/${projectId}/announcements/${createdId}`);
}
