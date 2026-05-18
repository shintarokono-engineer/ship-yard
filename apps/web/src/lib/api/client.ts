import 'server-only';

import { auth } from '@clerk/nextjs/server';

import { ApiError } from './errors';

/**
 * apps/api への Server-side fetch ラッパー。
 *
 * - Clerk の JWT を `Authorization: Bearer ...` で自動付与
 * - 既定で `cache: 'no-store'`(認証付きデータは Next.js のキャッシュに乗せない)
 * - 非 2xx は `ApiError` で throw、body は可能なら JSON にパースして添える
 * - 204 / Content-Length: 0 は `undefined` を返す
 *
 * Server Component / Server Action / Route Handler からのみ呼ぶこと(`server-only`)。
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const baseUrl = process.env.API_URL;
  if (!baseUrl) {
    throw new Error('API_URL is not set. apps/web/.env.local を確認してください。');
  }

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  // 既定 JSON は `body` が文字列のときのみ。FormData / Blob は fetch がマルチパート等を自動設定する。
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (!init.skipAuth) {
    const { getToken } = await auth();
    const token = await getToken();
    if (!token) {
      throw new ApiError('Unauthorized: Clerk session not found', 401);
    }
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers,
  });

  if (!res.ok) {
    const body = await safeJson(res);
    const message = `${init.method ?? 'GET'} ${path} -> ${res.status}`;
    throw new ApiError(message, res.status, body);
  }

  if (res.status === 204) return undefined as T;
  const contentLength = res.headers.get('content-length');
  if (contentLength === '0') return undefined as T;
  return (await res.json()) as T;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
