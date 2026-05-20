/**
 * 日付・数値の表示フォーマット用ヘルパー。Web 側の軽量整形のみ扱う
 * (API 側の Date 演算は `apps/api/src/common/time.ts` の dayjs を使う、CLAUDE.md)。
 *
 * TZ は `Asia/Tokyo` 固定。Server Component で render すると Node の実行 TZ に依存して
 * しまい本番(ECS Fargate, UTC)と開発(JST)で見え方が変わるため、明示的に固定する。
 */

const DISPLAY_TIMEZONE = 'Asia/Tokyo';

const DATE_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: DISPLAY_TIMEZONE,
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: DISPLAY_TIMEZONE,
});

const YEAR_MONTH_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  timeZone: DISPLAY_TIMEZONE,
});

/** ISO 8601 文字列を `YYYY/MM/DD` 形式で。null は空文字。 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return DATE_FORMATTER.format(new Date(iso));
}

/** ISO 8601 文字列を `YYYY/MM/DD HH:mm` で。null は空文字。 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return DATETIME_FORMATTER.format(new Date(iso));
}

/** ISO 8601 文字列を `YYYY年M月` で。null は空文字。 */
export function formatYearMonth(iso: string | null | undefined): string {
  if (!iso) return '';
  return YEAR_MONTH_FORMATTER.format(new Date(iso));
}
