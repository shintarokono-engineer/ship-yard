'use client';

import { Button } from '@/components/ui/button';

/**
 * 公開 LP ページ(`/p/{slug}/{projectId}`)のエラーバウンダリ(ADR-009 Day 33)。
 *
 * 公開 API が 500 等を返したときの素のサーバーエラー画面を避け、未認証の閲覧者にも読める
 * メッセージと再試行手段を出す。`notFound()`(LP 未公開 / 不在)は `error.tsx` ではなく
 * not-found 側で処理されるため、ここに来るのは想定外のエラーのみ。
 */
export default function PublicLandingPageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">ページを表示できませんでした</h1>
      <p className="text-muted-foreground text-sm">
        一時的な問題の可能性があります。時間をおいて再度お試しください。
      </p>
      <Button onClick={reset} variant="outline">
        再読み込み
      </Button>
    </main>
  );
}
