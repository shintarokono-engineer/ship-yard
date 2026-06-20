import { apiFetch } from './client';
import type { TwitterAccount } from './types';

/**
 * 外部サービス連携(ADR-014: Twitter)管理 API クライアント。
 *
 * BE 側 `IntegrationsTwitterController`(`/workspaces/:slug/integrations/twitter`)に対応。
 *
 * - 認可開始(`GET /authorize`)は X の認可画面に 302 リダイレクトするため、SSR から fetch ではなく
 *   `<a href={twitterAuthorizeUrl(slug)}>` でブラウザ遷移させる。
 * - list / disconnect は通常の JSON API。
 */

const base = (slug: string) => `/workspaces/${encodeURIComponent(slug)}/integrations/twitter`;

/**
 * Twitter OAuth 開始 URL(BE が X の認可画面へ 302 リダイレクトする)。
 *
 * fetch ではブラウザに渡せないので、設定画面の「X を連携」リンクで使う。
 * `API_URL` はサーバー専用のため、ここでは BE のパスのみ返し、apps/web 側のルートハンドラや
 * BFF プロキシ(`/api/integrations/twitter/authorize`)を経由する設計にしてもよい。
 *
 * MVP では BE を直接公開している前提で、`process.env.NEXT_PUBLIC_API_URL` を読む。
 */
export function twitterAuthorizeUrl(slug: string): string {
  const publicBase = process.env.NEXT_PUBLIC_API_URL;
  if (!publicBase) {
    throw new Error('NEXT_PUBLIC_API_URL is not set. apps/web/.env.local を確認してください。');
  }
  return `${publicBase}${base(slug)}/authorize`;
}

/** `GET /workspaces/:slug/integrations/twitter` — 連携アカウント一覧(token は含まない)。 */
export async function listTwitterAccounts(slug: string): Promise<TwitterAccount[]> {
  const res = await apiFetch<{ accounts: TwitterAccount[] }>(base(slug));
  return res.accounts;
}

/**
 * `DELETE /workspaces/:slug/integrations/twitter/:accountId` — 連携を切断する(OWNER / ADMIN)。
 * 既に存在しない場合も 200 + `{ ok: true }` で冪等(BE 側 deleteMany ガード)。
 */
export async function disconnectTwitterAccount(
  slug: string,
  accountId: string,
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`${base(slug)}/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
  });
}
