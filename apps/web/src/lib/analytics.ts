import Clarity from '@microsoft/clarity';
import { sendGAEvent } from '@next/third-parties/google';

/**
 * アクセス解析(GA4 + Microsoft Clarity)の薄いラッパー。**イベント送信は必ずここを経由する。**
 *
 * - **Client Component 専用**(`window` に触れる)
 * - **失敗は握りつぶす**。計測は付随機能であり、SDK の例外や広告ブロッカーでアプリを止めない
 * - **有効判定はタグの実在で行う**。計測タグは本番のみ `app/layout.tsx` が描画するため
 *   (`lib/analytics-env.ts`)、それ以外の環境では送信が自動的に no-op になる
 * - **PII を送らない**。メールアドレス・氏名・ワークスペース名・生成物の本文は引数に取らない
 */

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** GA4 管理画面のカスタム定義と一致させる必要があるため定数化する。 */
export const ANALYTICS_EVENTS = {
  SIGN_UP: 'sign_up',
  FIRST_GENERATION_COMPLETED: 'first_generation_completed',
  GENERATION_COMPLETED: 'generation_completed',
  CTA_CLICK: 'cta_click',
  PRICING_VIEWED: 'pricing_viewed',
} as const;

/**
 * `neorie.` 接頭辞は必須。`/sign-out-cleanup` が LocalStorage の `__clerk*` / `clerk_*` を
 * 掃除するため、その接頭辞と衝突させるとサインアウトのたびに判定がリセットされる。
 */
const STORAGE_KEY_PREFIX = 'neorie.analytics.';
const FIRST_GENERATION_KEY = `${STORAGE_KEY_PREFIX}first-generation`;
const SIGN_UP_SENT_KEY = `${STORAGE_KEY_PREFIX}sign-up-sent`;
const PRICING_VIEWED_KEY = `${STORAGE_KEY_PREFIX}pricing-viewed`;

/** AI 生成機能の識別子(GA4 の `feature` パラメータ)。 */
export const ANALYTICS_FEATURES = ['document', 'lp', 'checklist'] as const;
export type AnalyticsFeature = (typeof ANALYTICS_FEATURES)[number];

/** LP 上の CTA 設置位置(GA4 の `location` パラメータ)。 */
export const CTA_LOCATIONS = ['header', 'hero', 'pricing', 'footer'] as const;
export type CtaLocation = (typeof CTA_LOCATIONS)[number];

/**
 * 現在のユーザーを表す擬似 ID。LocalStorage キーの名前空間として使い、同一ブラウザで
 * 別アカウントに切り替えたときに判定を持ち越さないようにする。
 */
let currentUserKey = 'anonymous';

// ---------------------------------------------------------------------------
// 低レベルユーティリティ(いずれも例外を投げない)
// ---------------------------------------------------------------------------

function gaEvent(name: string, params?: Record<string, string>): void {
  try {
    if (typeof window === 'undefined') return;
    // `<GoogleAnalytics>` の init スクリプトが定義する。未定義 = 計測無効。
    if (!('dataLayer' in window)) return;
    sendGAEvent('event', name, params ?? {});
  } catch {
    // 計測失敗でアプリを止めない
  }
}

/** 以降の全イベントに適用されるフィールドを設定する(`gtag('set', ...)`)。 */
function gaSet(fields: Record<string, string>): void {
  try {
    if (typeof window === 'undefined') return;
    if (!('dataLayer' in window)) return;
    sendGAEvent('set', fields);
  } catch {
    // 同上
  }
}

/**
 * `@microsoft/clarity` の各メソッドは `window.clarity(...)` を素で呼ぶため、init 前だと
 * TypeError になる。存在チェック + try/catch の二段で防ぐ。
 */
function clarityEvent(name: string): void {
  try {
    if (typeof window === 'undefined' || typeof window.clarity !== 'function') return;
    Clarity.event(name);
  } catch {
    // 同上
  }
}

function claritySetTag(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || typeof window.clarity !== 'function') return;
    Clarity.setTag(key, value);
  } catch {
    // 同上
  }
}

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(`${key}:${currentUserKey}`);
  } catch {
    // プライベートモード等
    return null;
  }
}

function writeFlag(key: string, value: string): void {
  try {
    localStorage.setItem(`${key}:${currentUserKey}`, value);
  } catch {
    // 保存できない環境では毎回「初回」と判定されるが、計測が止まるよりはよい
  }
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * ログインユーザーの擬似 ID を設定する(GA4 の user_id = リテンション集計キー)。
 *
 * @param hashedUserId `hashUserId()` の戻り値。**生の ID や PII を渡してはならない。**
 */
export function setAnalyticsUserId(hashedUserId: string): void {
  currentUserKey = hashedUserId;
  gaSet({ user_id: hashedUserId });
  // Clarity は identify(画面に「顧客 ID」として出る)ではなくタグに留める。
  claritySetTag('user_key', hashedUserId);
}

/**
 * 内部ユーザー ID をハッシュ化して擬似 ID を作る(SHA-256 の先頭 32 桁)。
 *
 * ソルトを混ぜて、万一 GA4 側の値が漏れても既知 ID の総当たりで逆引きされにくくする。
 * Web Crypto は secure context 専用なので、使えない環境では null を返す。
 */
export async function hashUserId(rawUserId: string): Promise<string | null> {
  try {
    if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
    const data = new TextEncoder().encode(`neorie-analytics-v1:${rawUserId}`);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
  } catch {
    return null;
  }
}

/** サインアップ完了。`method` は認証手段(`google` / `email` 等)のみ、PII 不可。 */
export function trackSignUp(method: string): void {
  if (readFlag(SIGN_UP_SENT_KEY)) return;
  writeFlag(SIGN_UP_SENT_KEY, '1');

  gaEvent(ANALYTICS_EVENTS.SIGN_UP, { method });
  claritySetTag('sign_up_method', method);
  clarityEvent(ANALYTICS_EVENTS.SIGN_UP);
}

/**
 * AI 生成の成功。毎回 `generation_completed` を送り、初回だけ
 * `first_generation_completed` も送る。
 *
 * **初回判定を LocalStorage で行う理由**: サーバー側にユーザー単位の累計生成回数を返す口が無い
 * (`MonthlyUsageSummary` は当月・テナント単位の集計で、通算初回かは判定できない)。API に
 * 累計カウントを足す手もあるが、アクティベーション計測のためだけにエンドポイントを増やす判断は
 * 保留した。**別ブラウザ / LocalStorage クリア後は再び初回として計上される**点は許容する
 * (GA4 側でユーザー単位に重複排除できる)。正確な値が必要になったら API 側へ移すこと。
 */
export function trackGenerationCompleted(feature: AnalyticsFeature): void {
  gaEvent(ANALYTICS_EVENTS.GENERATION_COMPLETED, { feature });
  claritySetTag('generation_feature', feature);
  clarityEvent(ANALYTICS_EVENTS.GENERATION_COMPLETED);

  if (readFlag(FIRST_GENERATION_KEY)) return;
  writeFlag(FIRST_GENERATION_KEY, '1');

  gaEvent(ANALYTICS_EVENTS.FIRST_GENERATION_COMPLETED, { feature });
  claritySetTag('first_generation_feature', feature);
  clarityEvent(ANALYTICS_EVENTS.FIRST_GENERATION_COMPLETED);
}

/** LP 上の CTA クリック。`label` は固定文言のみ(ユーザー入力を渡すと PII が混入しうる)。 */
export function trackCtaClick(location: CtaLocation, label: string): void {
  gaEvent(ANALYTICS_EVENTS.CTA_CLICK, { location, label });
  claritySetTag('cta_location', location);
  clarityEvent(ANALYTICS_EVENTS.CTA_CLICK);
}

/**
 * 料金セクションの表示。1 セッション 1 回だけ送る。
 *
 * LocalStorage ではなく SessionStorage なのは「セッション内で料金を見たか」を知りたいため。
 * 再訪のたびに計上されるのが正しい。
 */
export function trackPricingViewed(): void {
  try {
    if (sessionStorage.getItem(PRICING_VIEWED_KEY)) return;
    sessionStorage.setItem(PRICING_VIEWED_KEY, '1');
  } catch {
    // 抑制はできないが送信自体は続行する
  }

  gaEvent(ANALYTICS_EVENTS.PRICING_VIEWED);
  clarityEvent(ANALYTICS_EVENTS.PRICING_VIEWED);
}
