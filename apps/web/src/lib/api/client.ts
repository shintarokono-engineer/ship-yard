import 'server-only';

import { auth } from '@clerk/nextjs/server';

import { ApiError } from './errors';

/**
 * apps/api へのリクエストを打ち切るまでのミリ秒。各ページの `maxDuration`(60 秒)より短くし、
 * Vercel の打ち切りより先に `ApiError(504)` として捕捉できるようにする。
 *
 * **打ち切っても API 側の処理は止まらない**(結果は保存され AI クレジットも消費される)。
 * 504 の文言が再実行ではなく再読み込みを促すのはこのため(`_shared/ai-form.ts`)。
 */
const API_TIMEOUT_MS = 55_000;

/**
 * apps/api への Server-side fetch ラッパー。
 *
 * - Clerk の JWT を `Authorization: Bearer ...` で自動付与
 * - 既定で `cache: 'no-store'`(認証付きデータは Next.js のキャッシュに乗せない)
 * - 非 2xx は `ApiError` で throw、body は可能なら JSON にパースして添える
 * - 204 / Content-Length: 0 は `undefined` を返す
 * - `API_TIMEOUT_MS` で打ち切り、タイムアウトは `status = 504` の `ApiError` にする
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
  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      ...init,
      // `...init` の後に置く(前だと `{ signal: undefined }` に上書きされる)。
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(API_TIMEOUT_MS)])
        : AbortSignal.timeout(API_TIMEOUT_MS),
      headers,
    });
  } catch (e) {
    // undici の版により TimeoutError / AbortError どちらもありうるため name で判定する。
    // ネットワーク不通(TypeError)とは区別し、時間切れだけを 504 に倒す。
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new ApiError(`${init.method ?? 'GET'} ${path} -> timeout`, 504);
    }
    throw e;
  }

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
