'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { jaJP } from '@clerk/localizations';
import { dark } from '@clerk/themes';
import { ThemeProvider, useTheme } from 'next-themes';

/**
 * アプリ全体の Client Provider。
 *
 * `<ClerkProvider>` を Server Component の layout ではなくここ(Client 境界)に置いている。
 * localization 辞書(42 kB)を Server Component から prop で渡すと RSC ペイロードに毎回
 * 直列化され、全ページの初期 HTML が gzip 後で約 19 kB 増える。Client 側で import すれば
 * ブラウザにキャッシュされる JS チャンクに載るため、初回のみのコストで済む。
 *
 * 前提: `<ClerkProvider dynamic>` を使っていないこと。dynamic 未指定時の Server 版は
 * `initialState: null` / `nonce: ''` を渡すだけで、Client 版との差が無い。
 * SSR 時に認証状態を先読みしたくなった場合(dynamic を付けたい場合)は、この構成では
 * 実現できないので layout 側に戻すこと。
 *
 * テーマは `next-themes` が `<html>` に class を付ける方式(`docs/implementation-rules.md`
 * の「`<body>` には固定属性のみ」に抵触しない。`<html suppressHydrationWarning>` は必須)。
 * 公開 LP(`/p/...`)も含めて全ページがテーマに追従する。LP ブロックは `lp-theme.ts` が
 * テーマごとに `dark:` 変種を持っており、アプリ内プレビューと公開ページの見え方が揃う。
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // 切替時に全要素のトランジションが走ってちらつくのを防ぐ。
      disableTransitionOnChange
    >
      <ThemedClerkProvider>{children}</ThemedClerkProvider>
    </ThemeProvider>
  );
}

/**
 * Clerk 埋め込み UI をアプリのテーマに追従させる。
 *
 * `appearance` は `<ClerkProvider>` の prop なので、`useTheme()` を読むために
 * ThemeProvider の内側の Client Component に分けている。
 */
function ThemedClerkProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  return (
    // afterSignOutUrl: F1.5(§9.12.2 観点 2)中間ページに遷移し LocalStorage /
    // SessionStorage cleanup + フルロードで Clerk SDK を再初期化する。
    // `<UserButton afterSignOutUrl>` は Clerk v6 で deprecated のため
    // `<ClerkProvider>` 側に集約(Clerk 公式ベストプラクティス)。
    // 加えて Clerk Dashboard で Multi-session handling を OFF にする運用前提
    // (デフォルト OFF、Sessions ページで確認)。
    <ClerkProvider
      localization={jaJP}
      afterSignOutUrl="/sign-out-cleanup"
      appearance={{ baseTheme: resolvedTheme === 'dark' ? dark : undefined }}
    >
      {children}
    </ClerkProvider>
  );
}
