'use server';

import { auth } from '@clerk/nextjs/server';

import { listAnnouncements } from '@/lib/api/announcements';
import { ApiError } from '@/lib/api/errors';
import type { AnnouncementListItem, LoadMoreResult } from '@/lib/api/types';

/**
 * 告知一覧の続き(cursor 以降の 1 ページ)を取得する Server Action。
 * Client Component の「さらに読み込む」から呼ぶ。`apiFetch` は server-only のためこの経路で橋渡しする。
 */
export async function loadMoreAnnouncementsAction(
  slug: string,
  projectId: string,
  cursor: string,
): Promise<LoadMoreResult<AnnouncementListItem>> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, message: '認証が必要です。再度サインインしてください。' };
  }
  try {
    const page = await listAnnouncements(slug, projectId, cursor);
    return { ok: true, page };
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, message: `続きの取得に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }
}
