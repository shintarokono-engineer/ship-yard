/**
 * Twitter (X) OAuth 2.0 PKCE 連携で使う定数群(ADR-014 §4)。
 * URL / scope / TTL / Redis key prefix を集約し、マジック文字列を避ける。
 */

/** OAuth state の TTL(秒)。5 分で十分(ユーザーの画面遷移 + X 認可 + callback)。 */
export const TWITTER_AUTH_STATE_TTL_SECONDS = 300;

/**
 * X OAuth 2.0 で要求する scope。
 * - `tweet.read` / `tweet.write` / `users.read` … API v2 の最小権限
 * - `offline.access` … refresh_token を発行してもらうために必須
 */
export const TWITTER_SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'offline.access',
] as const;

/** X 認可エンドポイント(ユーザーをリダイレクトする先)。 */
export const TWITTER_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';

/** X token エンドポイント(authorization_code / refresh_token grant 共用)。 */
export const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';

/** X 自ユーザー情報エンドポイント(連携直後に xUserId + handle を取得)。 */
export const TWITTER_USER_ME_URL = 'https://api.twitter.com/2/users/me';

/** X tweet 投稿エンドポイント。 */
export const TWITTER_TWEETS_URL = 'https://api.twitter.com/2/tweets';

/** X token revoke エンドポイント(切断時に best-effort で叩く)。 */
export const TWITTER_REVOKE_URL = 'https://api.twitter.com/2/oauth2/revoke';

/**
 * access_token 期限切れ直前の buffer(秒)。残り時間がこの値以下なら refresh する。
 * 投稿リクエスト中に期限切れになるのを避けるための余裕。
 */
export const TWITTER_TOKEN_REFRESH_BUFFER_SECONDS = 300;

/** Upstash Redis に保存する OAuth state の key prefix。 */
export const TWITTER_OAUTH_STATE_KEY_PREFIX = 'twitter_oauth:';
