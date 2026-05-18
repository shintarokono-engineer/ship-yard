import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'Shipyard',
  description:
    '個人開発者および小規模開発チーム向けの、アイデアからリリースまでを一元管理する AI 支援付き SaaS',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
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
