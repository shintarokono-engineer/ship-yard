/**
 * Announcement / Delivery / BlogPost 関連のマジックナンバーを集約(ADR-014)。
 * X API / SEO / UX で決まる固定値を 1 箇所に集めて、API DTO・Tool スキーマ・Service・FE が同じ値を参照する。
 */

/** Twitter 投稿の本文最大文字数(X API v2 仕様、ADR-014)。 */
export const TWITTER_TEXT_MAX = 280;

/** Blog 記事タイトル最大文字数(SEO 推奨、ADR-014)。 */
export const BLOG_TITLE_MAX = 120;

/** Blog 記事本文の最小文字数(空投稿防止、ADR-014)。 */
export const BLOG_BODY_MIN = 100;

/**
 * Blog 記事本文の最大文字数(DoS 防止、ADR-014)。
 * 20,000 字 ≒ A4 で 12 ページ程度。これを超える Markdown はブログとしては異常で、
 * WRITER_ROLES の侵害アカウントによる連続巨大 POST を未然に防ぐ。
 */
export const BLOG_BODY_MAX = 20000;

/** Blog の OG description 用 summary 最大文字数(ADR-014)。 */
export const BLOG_SUMMARY_MAX = 200;

/** BlogPost slug の最大長(URL 長制約 + UX、ADR-014)。 */
export const BLOG_SLUG_MAX = 80;

/** Announcement.title の最大長(内部管理用タイトル、ADR-014)。 */
export const ANNOUNCEMENT_TITLE_MAX = 120;

/** generate API の topic(ユーザーが伝えたい告知内容)の最大長(ADR-014)。 */
export const ANNOUNCEMENT_TOPIC_MAX = 500;
