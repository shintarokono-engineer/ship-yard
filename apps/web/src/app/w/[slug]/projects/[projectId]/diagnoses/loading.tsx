import { ChevronLeft } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]/projects/[projectId]/diagnoses` — プロダクト診断履歴のローディング(F5、§9.12.2 観点 5)。
 *
 * idea-validations と似たリスト構造だが、recommendation Badge は無い(スコア + アイコン + 日時のみ)。
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
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-9 w-36 shrink-0" />
        </div>
      </div>

      <ul className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-4" />
                <Skeleton className="h-6 w-20" />
              </div>
              <Skeleton className="h-3 w-32" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
