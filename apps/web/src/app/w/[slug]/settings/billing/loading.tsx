import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]/settings/billing` — 請求とプランのローディング(F5、§9.12.2 観点 5)。
 *
 * 見出しとタブは settings/layout.tsx 側にあるため、ここではタブ配下の
 * 「契約状況 + Stripe ポータル Card + プラン比較」だけを Skeleton で表現する。
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />

      <section className="space-y-3">
        <Skeleton className="h-6 w-28" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </section>
    </div>
  );
}
