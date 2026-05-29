import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]` — ワークスペース ダッシュボード(プロジェクト一覧)のローディング(F5、§9.12.2 観点 5)。
 *
 * 実ページの「タイトル + 説明 + アクション + Project Card グリッド(3 列)」 を Skeleton で
 * モック描画する。`fetchWorkspace` + `listProjects` の完了を待つ間に表示される。
 */
export default function Loading() {
  return (
    <div className="space-y-6 cursor-default">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32 shrink-0" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
