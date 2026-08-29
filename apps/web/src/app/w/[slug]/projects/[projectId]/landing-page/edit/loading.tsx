import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]/projects/[projectId]/landing-page/edit` — LP 編集のローディング
 * (F5、§9.12.2 観点 5)。
 *
 * 実ページの「パンくず + 見出し + 説明 + LpEditor(テーマ選択 + ブロックのフォーム列)」を
 * Skeleton で表現する。
 */
export default function Loading() {
  return (
    <div className="cursor-default space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
