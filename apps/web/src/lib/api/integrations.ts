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
 * fetch ではブラウザに渡せないので、設定画面の「X を連携」リンクの href として使う。
 * Server / Client 双方から呼び得るため、ブラウザに露出する `NEXT_PUBLIC_API_URL` を読む。
 * (将来 BFF プロキシ `/api/integrations/twitter/authorize` 経由に変えれば `API_URL` で済む)
 *
 * 環境変数未設定時は **`null` を返す**(throw しない)。呼び出し側で null をハンドリングして
 * 「設定が見つかりません」と提示するか、リンク自体を disable する。
 */
export function twitterAuthorizeUrl(slug: string): string | null {
  const publicBase = process.env.NEXT_PUBLIC_API_URL;
  if (!publicBase) {
    if (process.env.NODE_ENV !== 'production') {
      // ローカル / プレビューで設定漏れを発見しやすくする(本番は CSP / 監視で別途検知)。
      console.warn(
        '[twitterAuthorizeUrl] NEXT_PUBLIC_API_URL is not set. apps/web/.env.local を確認してください。',
      );
    }
    return null;
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
