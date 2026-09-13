import 'server-only';

import { cache } from 'react';
import { headers } from 'next/headers';

import { apiFetch } from './client';
import { ApiError } from './errors';
import type { PublicCheck } from './types';

/**
 * API にクライアント IP を伝えるヘッダ名。BE の `PUBLIC_CHECK_CLIENT_IP_HEADER` と一致させること。
 *
 * 診断の送信は Server Action → `apiFetch` を通るため、詰め替えないと全リクエストが
 * Vercel の同一 IP 扱いになる。
 */
const CLIENT_IP_HEADER = 'x-client-ip';

/** 呼び出し元のクライアント IP を取り出す。`x-forwarded-for` の先頭が本来のクライアント。 */
async function getClientIp(): Promise<string | null> {
  const forwarded = (await headers()).get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || null;
}

/** `POST /public/idea-checks`(未認証)。同期実行で 15〜22 秒かかる。 */
export async function runPublicCheck(ideaText: string): Promise<PublicCheck> {
  const clientIp = await getClientIp();
  return apiFetch<PublicCheck>('/public/idea-checks', {
    method: 'POST',
    skipAuth: true,
    headers: clientIp ? { [CLIENT_IP_HEADER]: clientIp } : undefined,
    body: JSON.stringify({ ideaText }),
  });
}

/**
 * `GET /public/idea-checks/:id`(未認証)。不在は `null`。
 *
 * 結果ページは `generateMetadata` と本体の両方から呼ぶため、`React.cache` で包んで
 * 1 回の描画で 2 往復しないようにする。
 */
export const fetchPublicCheck = cache(async (id: string): Promise<PublicCheck | null> => {
  try {
    return await apiFetch<PublicCheck>(`/public/idea-checks/${encodeURIComponent(id)}`, {
      skipAuth: true,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
});

/** `POST /idea-checks/:id/claim`(**認証必須**)の結果。 */
export interface PublicCheckClaimResult {
  workspaceSlug: string;
  /** 作成したプロジェクト ID。再引き換え(冪等パス)では null。 */
  projectId: string | null;
  /** 起動した 5 軸フル診断のジョブ ID。クレジット不足で起動できなければ null。 */
  jobId: string | null;
  alreadyClaimed: boolean;
}

/**
 * `POST /idea-checks/:id/claim`(**認証必須**)
 *
 * 公開エンドポイントとはパスが別。テナントを作る処理なので `skipAuth` を付けてはいけない。
 */
export async function claimPublicCheck(id: string): Promise<PublicCheckClaimResult> {
  return apiFetch<PublicCheckClaimResult>(`/idea-checks/${encodeURIComponent(id)}/claim`, {
    method: 'POST',
  });
}

/** `POST /public/idea-checks/:id/share`(未認証)。共有を opt-in で有効にする。 */
export async function sharePublicCheck(id: string): Promise<PublicCheck> {
  return apiFetch<PublicCheck>(`/public/idea-checks/${encodeURIComponent(id)}/share`, {
    method: 'POST',
    skipAuth: true,
  });
}
