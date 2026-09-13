'use client';

import { useEffect } from 'react';

import { Spinner } from '@/components/ui/spinner';

/**
 * 引き換え完了後の着地(ADR-015)。
 *
 * **`redirect()` ではなくフルロード遷移を使う。**サインアップ直後のクライアント遷移で
 * 開かれると、サーバー側 `redirect()` が follow されず白紙のまま留まることがある。
 */
export function ClaimRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-3 p-4">
      <Spinner className="text-primary size-8" />
      <p className="text-muted-foreground text-sm">ワークスペースを準備しています…</p>
    </div>
  );
}
