import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]/settings/members` — メンバー管理のローディング(F5、§9.12.2 観点 5)。
 *
 * 見出しとタブは settings/layout.tsx 側にあるため、ここではタブ配下の
 * 「メンバー一覧 + 招待一覧」の 2 セクションだけを Skeleton で表現する。
 */
export default function Loading() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-9 w-32 shrink-0" />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <Skeleton className="h-6 w-16" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-8 w-24 shrink-0" />
          </div>
        ))}
      </section>
    </div>
  );
}
