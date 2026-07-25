'use client';

import { MessageCircle } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import type { RagQaSession } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { useCursorList } from '@/lib/use-cursor-list';

import { loadMoreSessionsAction } from '../_actions/load-more-sessions';

/**
 * 壁打ちセッション一覧(cursor ページング)。先頭ページを Server Component から受け取り、
 * `nextCursor` がある間は「さらに読み込む」で続きを蓄積する。
 */
export function SessionList({
  slug,
  projectId,
  initialItems,
  initialNextCursor,
}: {
  slug: string;
  projectId: string;
  initialItems: RagQaSession[];
  initialNextCursor: string | null;
}) {
  const { items, hasMore, pending, onLoadMore } = useCursorList(
    initialItems,
    initialNextCursor,
    (cursor) => loadMoreSessionsAction(slug, projectId, cursor),
  );

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {items.map((session) => (
          <li key={session.id}>
            <Link
              href={`/w/${slug}/projects/${projectId}/rag-qa/${session.id}`}
              className="hover:bg-accent/30 focus-visible:ring-ring/50 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 outline-none transition-colors focus-visible:ring-[3px]"
            >
              <span className="flex items-center gap-2 font-medium">
                <MessageCircle className="text-muted-foreground size-4" aria-hidden="true" />
                {session.title}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {formatDateTime(session.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={pending}>
            {pending ? '読み込み中…' : 'さらに読み込む'}
          </Button>
        </div>
      )}
    </div>
  );
}
