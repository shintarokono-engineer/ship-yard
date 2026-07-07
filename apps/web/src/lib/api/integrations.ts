import { apiFetch } from './client';
import type { TwitterAccount } from './types';

/**
 * 外部サービス連携(ADR-014: Twitter)管理 API クライアント。
 *
 * BE 側 `IntegrationsTwitterController`(`/workspaces/:slug/integrations/twitter`)に対応。
 *
 * - 認可開始(`GET /authorize`)は BE が X の認可 URL を JSON で返す設計。ブラウザから `<a href>` で
 *   直接叩くと Authorization ヘッダーが送られず 401 になるため、Server Action 経由で Bearer JWT を
 *   付けて叩き、返ってきた URL を `redirect()` で辿る(BFF プロキシパターン、ADR-014 §API 設計)。
 * - list / disconnect は通常の JSON API。
 */

const base = (slug: string) => `/workspaces/${encodeURIComponent(slug)}/integrations/twitter`;

/**
 * `GET /workspaces/:slug/integrations/twitter/authorize` — Twitter OAuth 開始 URL を取得する。
 *
 * BE が state + PKCE verifier を Redis に保存した上で、X の認可 URL(`https://twitter.com/i/oauth2/authorize?...`)
 * を JSON で返す。呼び出し側は Server Action 内で `redirect(res.url)` して X 認可画面に遷移させる。
 * 403(OWNER/ADMIN 以外) / 503(env 未設定)は `ApiError` として throw される。
 */
export async function initiateTwitterAuthorize(slug: string): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(`${base(slug)}/authorize`);
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
