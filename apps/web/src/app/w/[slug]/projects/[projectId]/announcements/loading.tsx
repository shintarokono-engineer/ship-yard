import { ChevronLeft } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]/projects/[projectId]/announcements` — 告知一覧のローディング(F5、§9.12.2 観点 5)。
 *
 * 実ページの「戻るリンク + タイトル + 作成ボタン + 一覧」 を Skeleton で表現する。
 * 各カードは title + status Badge + 作成日時 + 各 Delivery channel/status バッジの構成。
 */
export default function Loading() {
  return (
    <div className="cursor-default space-y-6">
      <div className="space-y-2">
        <div className="text-muted-foreground inline-flex items-center gap-1 text-sm">
          <ChevronLeft className="size-4" aria-hidden="true" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-9 w-28 shrink-0" />
        </div>
      </div>

      <ul className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i}>
            <div className="space-y-3 rounded-lg border px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-3 w-40" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-6 w-24" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
