'use client';

import { useCallback, useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { LoadMoreResult } from '@/lib/api/types';

/**
 * cursor ページングの「さらに読み込む」を扱う汎用フック。
 *
 * 先頭ページ(`initialItems` + `initialCursor`)を Server Component から受け取り、
 * `loadMore(cursor)`(Server Action を bind したもの)で続きを取得して蓄積する。
 * 取得中は `pending`、続きが無ければ `hasMore=false`。失敗時は toast を出して現状維持。
 */
export function useCursorList<T>(
  initialItems: T[],
  initialCursor: string | null,
  loadMore: (cursor: string) => Promise<LoadMoreResult<T>>,
): { items: T[]; hasMore: boolean; pending: boolean; onLoadMore: () => void } {
  const [items, setItems] = useState<T[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [pending, startTransition] = useTransition();

  const onLoadMore = useCallback(() => {
    if (!cursor || pending) return;
    const current = cursor;
    startTransition(async () => {
      const res = await loadMore(current);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setItems((prev) => [...prev, ...res.page.items]);
      setCursor(res.page.nextCursor);
    });
  }, [cursor, pending, loadMore]);

  return { items, hasMore: cursor !== null, pending, onLoadMore };
}
