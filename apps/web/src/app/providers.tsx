'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { jaJP } from '@clerk/localizations';

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
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // afterSignOutUrl: F1.5(§9.12.2 観点 2)中間ページに遷移し LocalStorage /
    // SessionStorage cleanup + フルロードで Clerk SDK を再初期化する。
    // `<UserButton afterSignOutUrl>` は Clerk v6 で deprecated のため
    // `<ClerkProvider>` 側に集約(Clerk 公式ベストプラクティス)。
    // 加えて Clerk Dashboard で Multi-session handling を OFF にする運用前提
    // (デフォルト OFF、Sessions ページで確認)。
    <ClerkProvider localization={jaJP} afterSignOutUrl="/sign-out-cleanup">
      {children}
    </ClerkProvider>
  );
}
