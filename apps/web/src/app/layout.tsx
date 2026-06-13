import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

import { Toaster } from '@/components/ui/sonner';
import { getSiteUrl } from '@/lib/site-url';

// OG 画像・メタデータの絶対 URL 解決に使うベース URL(robots / sitemap と共通、`getSiteUrl` に集約)。
const siteUrl = getSiteUrl();

const description =
  '個人開発者および小規模開発チーム向けの、アイデアからリリースまでを一元管理する AI 支援付き SaaS';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Shipyard',
  description,
  openGraph: {
    title: 'Shipyard',
    description,
    siteName: 'Shipyard',
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Shipyard',
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // afterSignOutUrl: F1.5(§9.12.2 観点 2)中間ページに遷移し LocalStorage /
    // SessionStorage cleanup + フルロードで Clerk SDK を再初期化する。
    // `<UserButton afterSignOutUrl>` は Clerk v6 で deprecated のため
    // `<ClerkProvider>` 側に集約(Clerk 公式ベストプラクティス)。
    // 加えて Clerk Dashboard で Multi-session handling を OFF にする運用前提
    // (デフォルト OFF、Sessions ページで確認)。
    <ClerkProvider afterSignOutUrl="/sign-out-cleanup">
      <html lang="ja">
        {/* ブラウザ拡張(ColorZilla 等)が body に属性注入することによる
            hydration mismatch を抑制(1 階層のみ。子要素の警告は引き続き出る) */}
        <body className="antialiased" suppressHydrationWarning>
          {children}
          <Toaster richColors position="bottom-right" />
        </body>
      </html>
    </ClerkProvider>
  );
}
