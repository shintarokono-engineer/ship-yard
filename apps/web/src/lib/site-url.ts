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
