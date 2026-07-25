import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  cursorArgs,
  resolveLimit,
  toCursorPage,
} from './pagination';

describe('pagination helpers', () => {
  describe('resolveLimit', () => {
    it('未指定は DEFAULT_PAGE_SIZE', () => {
      expect(resolveLimit(undefined)).toBe(DEFAULT_PAGE_SIZE);
    });
    it('範囲内はそのまま', () => {
      expect(resolveLimit(10)).toBe(10);
    });
    it('MAX 超過は MAX に丸める', () => {
      expect(resolveLimit(MAX_PAGE_SIZE + 500)).toBe(MAX_PAGE_SIZE);
    });
    it('1 未満は 1 に丸める', () => {
      expect(resolveLimit(0)).toBe(1);
      expect(resolveLimit(-5)).toBe(1);
    });
  });

  describe('cursorArgs', () => {
    it('cursor 無し: take=limit+1 のみ(cursor/skip なし)', () => {
      expect(cursorArgs(undefined, 50)).toEqual({ take: 51 });
    });
    it('cursor 有り: cursor + skip:1 を付与', () => {
      expect(cursorArgs('abc', 50)).toEqual({ take: 51, cursor: { id: 'abc' }, skip: 1 });
    });
  });

  describe('toCursorPage', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `id-${i}` }));

    it('取得件数 ≤ limit: 全件 + nextCursor=null(最終ページ)', () => {
      expect(toCursorPage(rows, 10)).toEqual({ items: rows, nextCursor: null });
    });
    it('取得件数 > limit: limit 件に切り詰め + 末尾 id を nextCursor に', () => {
      // limit=4 に対し take=5 で 5 件取れた想定 → 続きあり
      const page = toCursorPage(rows, 4);
      expect(page.items).toHaveLength(4);
      expect(page.items.map((r) => r.id)).toEqual(['id-0', 'id-1', 'id-2', 'id-3']);
      expect(page.nextCursor).toBe('id-3');
    });
    it('ちょうど limit 件: 続きなし', () => {
      expect(toCursorPage(rows, 5)).toEqual({ items: rows, nextCursor: null });
    });
  });
});
