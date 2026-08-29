import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]/settings/usage` — AI 利用状況のローディング(F5、§9.12.2 観点 5)。
 *
 * 見出しとタブは settings/layout.tsx 側にあるため、ここではタブ配下の
 * 「今月のクレジット消費 Card + 機能別内訳 Card」だけを Skeleton で表現する。
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
