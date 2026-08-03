import type { Metadata } from 'next';
import './globals.css';

import { Toaster } from '@/components/ui/sonner';
import { getSiteUrl } from '@/lib/site-url';

import { Providers } from './providers';

// OG 画像・メタデータの絶対 URL 解決に使うベース URL(robots / sitemap と共通、`getSiteUrl` に集約)。
const siteUrl = getSiteUrl();

const description =
  '個人開発者および小規模開発チーム向けの、アイデアからリリースまでを一元管理する AI 支援付き SaaS';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Neorie',
  description,
  openGraph: {
    title: 'Neorie',
    description,
    siteName: 'Neorie',
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Neorie',
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes が hydration 前に `<html>` へ theme class を
    // 付けるため必須(docs/implementation-rules.md「フロントエンド」節の例外に該当)。
    <html lang="ja" suppressHydrationWarning>
      {/* ブラウザ拡張(ColorZilla 等)が body に属性注入することによる
          hydration mismatch を抑制(1 階層のみ。子要素の警告は引き続き出る) */}
      <body className="antialiased" suppressHydrationWarning>
        <Providers>
          {children}
          <Toaster richColors position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
