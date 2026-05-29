import { ChevronLeft } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]/projects/[projectId]/checklist` — チェックリスト一覧のローディング(F5、§9.12.2 観点 5)。
 *
 * 実ページの「戻るリンク + タイトル + AI 生成ボタン + カテゴリ別アコーディオン 5 セクション」 を
 * Skeleton で表現する。各カテゴリは閉じた状態(summary 行のみ)で出す。
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
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-36 shrink-0" />
        </div>
      </div>

      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border">
            <div className="flex items-center justify-between px-4 py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
