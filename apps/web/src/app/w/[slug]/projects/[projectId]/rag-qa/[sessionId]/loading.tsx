import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/w/[slug]/projects/[projectId]/rag-qa/[sessionId]` — 壁打ちセッションのローディング
 * (F5、§9.12.2 観点 5)。
 *
 * 実ページの「パンくず + セッション名 + 説明 + チャットパネル(メッセージ列 + 入力欄)」を
 * Skeleton で表現する。
 */
export default function Loading() {
  return (
    <div className="cursor-default space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="space-y-4 rounded-xl border p-4">
        <div className="space-y-4">
          <Skeleton className="h-16 w-2/3 rounded-lg" />
          <Skeleton className="ml-auto h-24 w-3/4 rounded-lg" />
          <Skeleton className="h-16 w-2/3 rounded-lg" />
        </div>
        <Skeleton className="h-20 w-full rounded-md" />
      </div>
    </div>
  );
}
