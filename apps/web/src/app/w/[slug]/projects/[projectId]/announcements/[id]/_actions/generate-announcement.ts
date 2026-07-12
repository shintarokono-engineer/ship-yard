'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { generateAnnouncement } from '@/lib/api/announcements';
import { ApiError } from '@/lib/api/errors';
import {
  ANNOUNCEMENT_TOPIC_MAX,
  DELIVERY_CHANNELS,
  type DeliveryChannel,
} from '@/lib/api/types';

import type { GenerateAnnouncementFormState } from '../_shared/generate-announcement-form';

/**
 * Announcement の多チャネル文面を Sonnet 4 + Tool Use で生成する Server Action(ADR-014)。
 *
 * - `topic`(必須):今回伝えたい告知の自由入力(1〜`ANNOUNCEMENT_TOPIC_MAX` 字)
 * - `channels`(任意):部分再生成。未指定 = 全 channel(TWITTER + BLOG)
 *
 * Free フォールバック / クレジット超過は `classifyAiApiError` で UI 文言に振り分け、
 * `quotaExceeded` フラグで Pro 誘導 CTA を出す分岐に使う。
 */
export async function generateAnnouncementAction(
  slug: string,
  projectId: string,
  id: string,
  _prev: GenerateAnnouncementFormState,
  formData: FormData,
): Promise<GenerateAnnouncementFormState> {
  void _prev;
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const topic = String(formData.get('topic') ?? '').trim();
  const rawChannels = formData.getAll('channels').map((v) => String(v));
  const channels = rawChannels.filter((c): c is DeliveryChannel =>
    (DELIVERY_CHANNELS as readonly string[]).includes(c),
  );

  if (!topic) {
    return {
      ok: false,
      fieldErrors: { topic: ['告知内容を入力してください。'] },
      fields: { topic, channels },
    };
  }
  if (topic.length > ANNOUNCEMENT_TOPIC_MAX) {
    return {
      ok: false,
      fieldErrors: {
        topic: [`告知内容は ${ANNOUNCEMENT_TOPIC_MAX} 文字以内で入力してください。`],
      },
      fields: { topic, channels },
    };
  }

  try {
    await generateAnnouncement(slug, projectId, id, {
      topic,
      channels: channels.length > 0 ? channels : undefined,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      const classified = classifyAiApiError(e);
      if (classified.kind === 'quota_exceeded') {
        return {
          ok: false,
          formError: classified.messages[0],
          quotaExceeded: true,
          fields: { topic, channels },
        };
      }
      if (classified.kind === 'forbidden') {
        return {
          ok: false,
          formError: classified.messages[0],
          fields: { topic, channels },
        };
      }
      if (classified.kind === 'not_found') {
        return {
          ok: false,
          formError: '告知 / プロジェクトが見つかりません。',
          fields: { topic, channels },
        };
      }
      if (classified.kind === 'bad_request') {
        return {
          ok: false,
          formError: classified.messages.join(' / ') || 'リクエストが不正です。',
          fields: { topic, channels },
        };
      }
      if (classified.kind === 'bad_response') {
        return {
          ok: false,
          formError: classified.messages[0],
          fields: { topic, channels },
        };
      }
      return {
        ok: false,
        formError: `告知文面の生成に失敗しました (HTTP ${e.status})`,
        fields: { topic, channels },
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/announcements/${id}`);
  revalidatePath(`/w/${slug}/projects/${projectId}/announcements`);
  return { ok: true, fields: { topic, channels } };
}
