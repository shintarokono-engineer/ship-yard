/**
 * アクセス解析タグがブラウザに生やすグローバル。
 *
 * `window.clarity` は `@microsoft/clarity` の `init()` が注入するスクリプトが定義する。
 * 型を持たせておかないと `lib/analytics.ts` の「init 済みか」の存在チェックが書けない
 * (SDK 側は未初期化でも構わず `window.clarity(...)` を呼ぶので、こちらで防ぐ必要がある)。
 */
declare global {
  interface Window {
    /** Microsoft Clarity のコマンドキュー。init 前は undefined。 */
    clarity?: (...args: unknown[]) => void;
    /** GA4(gtag.js)のデータレイヤー。`<GoogleAnalytics>` の init スクリプトが定義する。 */
    dataLayer?: unknown[];
  }
}

export {};
