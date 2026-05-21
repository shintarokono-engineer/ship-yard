/**
 * AI 生成の URL を `<a href>` に渡す前にスキームを検証する(ADR-009)。
 *
 * `javascript:` / `data:` 等の実行可能スキームを `<a href>` に渡すとクリックでスクリプトが走る
 * (stored XSS)。LP ブロックの href は `instructions`(ユーザー入力)→ Claude 生成 → 永続化 →
 * Day 33 で公開、という経路をたどるため、http(s) / mailto / 相対パス / ページ内アンカーのみ許可し、
 * それ以外は無害な `#` に倒す。
 */
export function safeHref(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return '#';
  // スキームを持たない相対パス・ページ内アンカーは許可。
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  try {
    // 絶対 URL はスキームを検証する(`javascript:` 等は protocol が一致せず弾かれる)。
    const protocol = new URL(trimmed).protocol;
    return ['http:', 'https:', 'mailto:'].includes(protocol) ? trimmed : '#';
  } catch {
    // URL としてパースできない = 有効なスキームを持たない相対文字列。XSS にはならないため許可。
    return trimmed;
  }
}
