import { ChevronLeft } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]/projects/[projectId]` — プロジェクト詳細のローディング(F5、§9.12.2 観点 5)。
 *
 * 実ページの「戻るリンク + タイトル + バッジ + アクション群 + 機能 Card グリッド」 を Skeleton で
 * モック描画する。Project / Workspace の取得完了までの数百 ms を埋める。
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
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="flex shrink-0 gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
