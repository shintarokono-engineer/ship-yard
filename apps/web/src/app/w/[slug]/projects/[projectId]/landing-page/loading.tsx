import { ChevronLeft } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]/projects/[projectId]/landing-page` — LP プレビューのローディング(F5、§9.12.2 観点 5)。
 *
 * 実ページの擬似ブラウザフレーム + 大きなプレビュー領域を Skeleton で表現する。
 * LP は生成済み or 未生成で表示が大きく異なるが、ロード中は同一の placeholder を出す。
 */
export default function Loading() {
  return (
    <div className="space-y-6 cursor-default">
      <div className="space-y-2">
        <div className="text-muted-foreground inline-flex items-center gap-1 text-sm">
          <ChevronLeft className="size-4" aria-hidden="true" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex shrink-0 gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div className="bg-muted flex items-center gap-3 border-b px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-red-400/40" />
            <span className="size-2.5 rounded-full bg-amber-400/40" />
            <span className="size-2.5 rounded-full bg-emerald-400/40" />
          </span>
          <Skeleton className="mx-auto h-4 w-64" />
        </div>
        <div className="space-y-4 p-6">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="grid gap-4 pt-4 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
