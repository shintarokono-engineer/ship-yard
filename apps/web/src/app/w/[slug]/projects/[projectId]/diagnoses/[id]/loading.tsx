import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]/projects/[projectId]/diagnoses/[id]` — 診断結果のローディング(F5、§9.12.2 観点 5)。
 *
 * 実ページの「パンくず + 見出し + スコアサマリ + レーダー/バーの 2 カラム + 改善提案 + 競合参照」を
 * Skeleton で表現する。
 */
export default function Loading() {
  return (
    <div className="cursor-default space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>

      <Skeleton className="h-28 rounded-xl" />

      <section className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-6 w-24" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </section>

      <section className="space-y-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-16 rounded-lg" />
      </section>
    </div>
  );
}
