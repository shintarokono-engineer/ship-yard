import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
