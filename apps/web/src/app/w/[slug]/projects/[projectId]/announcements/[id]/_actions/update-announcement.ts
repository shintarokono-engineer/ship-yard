'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { updateAnnouncement } from '@/lib/api/announcements';
import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import {
  ANNOUNCEMENT_TITLE_MAX,
  TWITTER_TEXT_MAX,
} from '@/lib/api/types';

import type { UpdateAnnouncementFormState } from '../_shared/update-announcement-form';

/**
 * Announcement のタイトル / Twitter Delivery content を編集する Server Action(ADR-014)。
 *
 * 1 つの Action で title と twitterContent を同時に更新可能。`title` または `twitterText` の
 * どちらかが指定されていれば PATCH を送り、両方未指定は no-op。
 */
export async function updateAnnouncementAction(
  slug: string,
  projectId: string,
  id: string,
  field: 'title' | 'twitter',
  _prev: UpdateAnnouncementFormState,
  formData: FormData,
): Promise<UpdateAnnouncementFormState> {
  void _prev;
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const titleRaw = String(formData.get('title') ?? '').trim();
  const twitterRaw = String(formData.get('twitterText') ?? '').trim();
  const body: { title?: string; twitterContent?: { text: string } } = {};

  if (field === 'title') {
    if (!titleRaw) {
      return {
        ok: false,
        fieldErrors: { title: ['タイトルを入力してください。'] },
        fields: { title: titleRaw },
      };
    }
    if (titleRaw.length > ANNOUNCEMENT_TITLE_MAX) {
      return {
        ok: false,
        fieldErrors: {
          title: [`タイトルは ${ANNOUNCEMENT_TITLE_MAX} 文字以内で入力してください。`],
        },
        fields: { title: titleRaw },
      };
    }
    body.title = titleRaw;
  } else {
    if (!twitterRaw) {
      return {
        ok: false,
        fieldErrors: { twitterText: ['本文を入力してください。'] },
        fields: { twitterText: twitterRaw },
      };
    }
    if (twitterRaw.length > TWITTER_TEXT_MAX) {
      return {
        ok: false,
        fieldErrors: {
          twitterText: [`X の本文は ${TWITTER_TEXT_MAX} 文字以内で入力してください。`],
        },
        fields: { twitterText: twitterRaw },
      };
    }
    body.twitterContent = { text: twitterRaw };
  }

  try {
    await updateAnnouncement(slug, projectId, id, body);
  } catch (e) {
    if (e instanceof ApiError) {
      const msgs = extractValidationMessages(e.body);
      if (e.status === 403) {
        return {
          ok: false,
          formError: '告知を更新する権限がありません。',
          fields: { title: titleRaw, twitterText: twitterRaw },
        };
      }
      if (e.status === 404) {
        return {
          ok: false,
          formError: '告知が見つかりません。',
          fields: { title: titleRaw, twitterText: twitterRaw },
        };
      }
      if (e.status === 400 && msgs.length > 0) {
        return {
          ok: false,
          formError: msgs.join(' / '),
          fields: { title: titleRaw, twitterText: twitterRaw },
        };
      }
      return {
        ok: false,
        formError: `告知の更新に失敗しました (HTTP ${e.status})`,
        fields: { title: titleRaw, twitterText: twitterRaw },
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/announcements/${id}`);
  revalidatePath(`/w/${slug}/projects/${projectId}/announcements`);
  return { ok: true, fields: { title: titleRaw, twitterText: twitterRaw } };
}
