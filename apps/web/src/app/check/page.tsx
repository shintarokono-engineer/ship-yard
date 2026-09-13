import type { Metadata } from 'next';

import { JsonLd } from '@/components/json-ld';
import { getSiteUrl } from '@/lib/site-url';

import { SiteFooter } from '../_components/marketing/site-footer';
import { AxesSection } from './_components/axes-section';
import { CheckHeader } from './_components/check-header';
import { FAQS, FaqSection } from './_components/faq-section';
import { HeroSection } from './_components/hero-section';
import { HowItWorksSection } from './_components/how-it-works-section';
import { NeorieSection } from './_components/neorie-section';
import { SampleSection } from './_components/sample-section';

/**
 * `/check` の SEO メタ(ADR-015)。
 *
 * 結果ページと違いここは index させる。実際に打たれるクエリ(「アイデア 評価」
 * 「ビジネスアイデア 採点 AI」「アイデア 検証 ツール」)と一致する語で書く。
 */
export const metadata: Metadata = {
  title: 'アイデア評価ツール | 作りたいアプリを AI が 100 点満点で採点します',
  description:
    'これから作るアプリ・Web サービスのアイデアを 100 点満点で採点し、優先度付きの改善提案を返す無料ツールです。ログイン不要。課題の強度・対象の到達可能性・打ち手の妥当性の 3 つの観点で AI が採点します。',
  alternates: { canonical: '/check' },
  openGraph: {
    title: 'アプリのアイデア評価ツール | Neorie',
    description: '作りたいアプリのアイデアを AI が 100 点満点で採点します。ログイン不要・無料。',
    type: 'website',
    url: '/check',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'アプリのアイデア評価ツール | Neorie',
    description: '作りたいアプリのアイデアを AI が 100 点満点で採点します。ログイン不要・無料。',
  },
};

/**
 * `/check` — 無料公開アイデア検証ツール(ADR-015)。
 *
 * ログイン不要(Clerk middleware の公開ルートに登録済み)。アプリのシェル(`/w/` レイアウト)を
 * 持たず、LP と同じヘッダー / フッターでランディングとして独立させる。
 */
export default function CheckPage() {
  const siteUrl = getSiteUrl();
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'アプリのアイデア評価ツール',
      applicationCategory: 'BusinessApplication',
      description:
        'これから作るアプリ・Web サービスのアイデアを AI が 100 点満点で採点し、優先度付きの改善提案を返す無料ツール。',
      url: `${siteUrl}/check`,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={jsonLd} />
      <CheckHeader />
      <main className="flex-1">
        <HeroSection />
        <HowItWorksSection />
        <SampleSection />
        <AxesSection />
        <NeorieSection />
        <FaqSection />
      </main>
      <SiteFooter />
    </div>
  );
}
