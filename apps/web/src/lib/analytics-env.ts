/**
 * アクセス解析(GA4 / Microsoft Clarity)を有効化するかどうかの判定。
 *
 * **本番(Vercel Production)でのみ計測する。** 判定に使う `VERCEL_ENV` は Vercel が注入する
 * システム環境変数で、ローカルでは未定義 = 自動的に無効になる。`NEXT_PUBLIC_` を付けず
 * **Server Component 側で判定する**のが要点で、無効な環境では計測タグのレンダリング自体を
 * 止める(= 計測 ID すらクライアントに配らない)。
 *
 * ID 未設定のときも無効。空文字を渡して壊れるより静かに計測されない方がよい
 * (設定漏れは GA4 のリアルタイムレポートで気付ける)。
 *
 * **CSP を導入するときの注意**: 2026-08-23 時点で本リポジトリに CSP は無い。将来入れる場合、
 * 計測タグを黙って落とさないよう以下を許可すること。
 *   - `script-src`:  https://www.googletagmanager.com  https://*.clarity.ms
 *   - `connect-src`: https://*.google-analytics.com     https://*.clarity.ms
 */

function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

/** GA4 測定 ID(`G-XXXXXXXXXX`)。無効な環境・未設定なら null。 */
export function getGaId(): string | null {
  if (!isProductionDeployment()) return null;
  return process.env.NEXT_PUBLIC_GA_ID || null;
}

/** Clarity プロジェクト ID。無効な環境・未設定なら null。 */
export function getClarityProjectId(): string | null {
  if (!isProductionDeployment()) return null;
  return process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || null;
}
