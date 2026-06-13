import { ChevronLeft } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]/projects/[projectId]/documents` — ドキュメント一覧のローディング(F5、§9.12.2 観点 5)。
 *
 * DocType 6 種の Card グリッド(2 列)を Skeleton で表現する。実ページと同じ高さ・余白で
 * レイアウトシフトを抑える。
 */
export default function Loading() {
  return (
    <div className="space-y-6 cursor-default">
      <div className="space-y-2">
        <div className="text-muted-foreground inline-flex items-center gap-1 text-sm">
          <ChevronLeft className="size-4" aria-hidden="true" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
