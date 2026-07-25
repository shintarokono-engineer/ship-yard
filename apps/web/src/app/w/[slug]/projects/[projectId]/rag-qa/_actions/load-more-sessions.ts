'use server';

import { auth } from '@clerk/nextjs/server';

import { ApiError } from '@/lib/api/errors';
import type { LoadMoreResult, RagQaSession } from '@/lib/api/types';
import { listRagQaSessions } from '@/lib/api/workspaces';

/**
 * 壁打ちセッション一覧の続き(cursor 以降の 1 ページ)を取得する Server Action。
 * Client Component の「さらに読み込む」から呼ぶ。`apiFetch` は server-only のためこの経路で橋渡しする。
 */
export async function loadMoreSessionsAction(
  slug: string,
  projectId: string,
  cursor: string,
): Promise<LoadMoreResult<RagQaSession>> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, message: '認証が必要です。再度サインインしてください。' };
  }
  try {
    const page = await listRagQaSessions(slug, projectId, cursor);
    return { ok: true, page };
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, message: `続きの取得に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }
}
