/**
 * サイトの絶対 URL ベースを解決する。OG 画像 / メタデータ / robots / sitemap で共有する。
 *
 * 本番ドメインは Day 37 で取得予定のため、環境変数 → Vercel 本番 URL → localhost の順で
 * フォールバックする(`layout.tsx` の `metadataBase` と同一ロジックを集約)。末尾スラッシュは付けない。
 */
export function getSiteUrl(): string {
  return (
    process.env.SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000')
  );
}

/**
 * URL 例を画面に見せるためのホスト名(スキーム無し)。
 *
 * 「`example.com/w/{slug}`」のようにワークスペース / 公開 LP の URL を提示する箇所で使う。
 * ここをハードコードするとドメイン変更時に画面だけ古い表記が残るため、`getSiteUrl` から導く。
 * `SITE_URL` を読むので **Server Component 専用**。Client へは prop で渡すこと。
 */
export function getSiteHost(): string {
  return getSiteUrl().replace(/^https?:\/\//, '');
}
