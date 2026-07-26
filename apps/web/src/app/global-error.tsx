'use client';

import { useEffect } from 'react';

/**
 * root layout(`app/layout.tsx`)自体で例外が起きた場合の最終フォールバック。
 *
 * `global-error.tsx` は root layout を置き換えるため、自前で `<html>`/`<body>` を描画する必要がある。
 * 通常のページ例外は `app/error.tsx` が受けるので、ここに来るのは layout 描画自体が失敗する稀な
 * ケース。最小限の再読み込み導線のみ提供する(依存を増やさず確実に描画されるよう素の要素で構成)。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error boundary caught:', error);
  }, [error]);

  return (
    <html lang="ja">
      <body
        className="antialiased"
        suppressHydrationWarning
        style={{
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '1.5rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>問題が発生しました</h1>
        <p style={{ color: '#666', fontSize: '0.875rem', maxWidth: '28rem' }}>
          一時的な問題の可能性があります。時間をおいて再度お試しください。
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: '1px solid #ccc',
            borderRadius: '0.5rem',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          再読み込み
        </button>
      </body>
    </html>
  );
}
