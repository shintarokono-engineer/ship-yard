import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]/projects/[projectId]/announcements/[id]` — 告知詳細のローディング(F5、§9.12.2 観点 5)。
 *
 * 実ページの「パンくず + タイトル + 状態 Badge + 操作ボタン群 + Delivery カード 2 枚
 * (TWITTER / BLOG)」を Skeleton で表現する。
 */
export default function Loading() {
  return (
    <div className="cursor-default space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-72" />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-5" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-24 w-full rounded-md" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
