'use client';

import Link from 'next/link';

import { InlineEmpty } from '@/components/inline-empty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ANNOUNCEMENT_STATUS_META,
  DELIVERY_CHANNEL_META,
  DELIVERY_STATUS_META,
  type AnnouncementListItem,
} from '@/lib/api/types';
import { EMPTY_MESSAGES } from '@/lib/empty-messages';
import { formatDateTime } from '@/lib/format';
import { useCursorList } from '@/lib/use-cursor-list';

import { loadMoreAnnouncementsAction } from '../_actions/load-more-announcements';

/**
 * 告知一覧(cursor ページング)。先頭ページを Server Component から受け取り、
 * `nextCursor` がある間は「さらに読み込む」で続きを蓄積する。
 */
export function AnnouncementList({
  slug,
  projectId,
  initialItems,
  initialNextCursor,
}: {
  slug: string;
  projectId: string;
  initialItems: AnnouncementListItem[];
  initialNextCursor: string | null;
}) {
  const { items, hasMore, pending, onLoadMore } = useCursorList(
    initialItems,
    initialNextCursor,
    (cursor) => loadMoreAnnouncementsAction(slug, projectId, cursor),
  );

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {items.map((a) => {
          const statusMeta = ANNOUNCEMENT_STATUS_META[a.status];
          return (
            <li key={a.id}>
              <Link
                href={`/w/${slug}/projects/${projectId}/announcements/${a.id}`}
                className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
              >
                <Card className="hover:border-primary/40 cursor-pointer transition-all hover:shadow-md motion-safe:hover:-translate-y-0.5 [&_*]:cursor-pointer">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span className="truncate">{a.title}</span>
                      <Badge
                        variant={statusMeta.badgeVariant}
                        className={statusMeta.badgeClassName}
                      >
                        {statusMeta.label}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-muted-foreground text-xs">
                      作成 {formatDateTime(a.createdAt)}
                    </p>
                    {a.deliveries.length === 0 ? (
                      <InlineEmpty size="xs">{EMPTY_MESSAGES.announcementDeliveries}</InlineEmpty>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {a.deliveries.map((d) => {
                          const chMeta = DELIVERY_CHANNEL_META[d.channel];
                          const stMeta = DELIVERY_STATUS_META[d.status];
                          return (
                            <span
                              key={d.channel}
                              className="border-border text-foreground/80 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs"
                            >
                              {chMeta.label}
                              <Badge
                                variant={stMeta.badgeVariant}
                                className={`${stMeta.badgeClassName ?? ''} text-[10px]`}
                              >
                                {stMeta.label}
                              </Badge>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </li>
          );
        })}
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
