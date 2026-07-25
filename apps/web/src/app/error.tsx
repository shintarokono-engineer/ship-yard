'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * アプリ全体のエラーバウンダリ(ルート `error.tsx`)。
 *
 * `/`・`/w/{slug}`・`/onboarding` 等の認証必須ルートは各自の `error.tsx` を持たないため、
 * サーバコンポーネントが例外を投げると Next のフォールバックで**白紙**になっていた
 * (例: ログイン直後に所属解決 API が一時的に 500 を返す等)。ここで受け止め、白紙でなく
 * 再試行導線を出す。root layout 自体の例外は `global-error.tsx` 側で処理する。
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 開発時の切り分け用にコンソールへ残す(本番でも digest から相関できる)。
    console.error('App error boundary caught:', error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">問題が発生しました</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        一時的な問題の可能性があります。再読み込みしても解消しない場合は、時間をおくか、サインインし直してお試しください。
      </p>
      <div className="flex gap-2">
        <Button onClick={reset} variant="outline">
          再読み込み
        </Button>
        <Button asChild>
          <a href="/">ホームへ</a>
        </Button>
      </div>
    </main>
  );
}
