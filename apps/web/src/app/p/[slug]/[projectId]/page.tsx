import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/json-ld';
import { LpRenderer } from '@/components/lp-blocks/lp-renderer';
import type { HeroBlock } from '@/lib/api/types';
import { fetchPublicLandingPage } from '@/lib/api/workspaces';
import { getSiteUrl } from '@/lib/site-url';

type PublicLandingPageParams = Promise<{ slug: string; projectId: string }>;

/**
 * 公開 LP ページの OG / SEO メタを生成する。`fetchPublicLandingPage` は `React.cache` 済みなので、
 * 本体の描画と HTTP 通信は共有される(1 リクエスト 1 回)。
 */
export async function generateMetadata({
  params,
}: {
  params: PublicLandingPageParams;
}): Promise<Metadata> {
  const { slug, projectId } = await params;
  const lp = await fetchPublicLandingPage(slug, projectId);
  if (!lp) {
    return { title: 'ページが見つかりません' };
  }

  // OG description は LP 自身の訴求文(hero の sub)から導出する。内部フィールドは公開面に出さない。
  const heroSub = lp.blocks.find((b): b is HeroBlock => b.type === 'hero')?.sub;
  const description = heroSub?.trim() || `${lp.projectName} のランディングページ`;
  return {
    title: lp.projectName,
    description,
    openGraph: { title: lp.projectName, description, type: 'website' },
    twitter: { card: 'summary', title: lp.projectName, description },
  };
}

/**
 * `/p/{slug}/{projectId}` — 公開ランディングページ(ADR-009 Day 33)。
 *
 * 未認証で閲覧できる(Clerk middleware の公開ルートに登録済み)。API も `publishedAt` がセットされた
 * LP のみ返すため、未公開 / 未生成 / 不在はすべて 404(`notFound()`)。アプリのシェル(`/w/` レイアウト)
 * を持たず、ルートレイアウト直下で LP ブロックのみを全画面描画する。
 */
export default async function PublicLandingPage({ params }: { params: PublicLandingPageParams }) {
  const { slug, projectId } = await params;
  const lp = await fetchPublicLandingPage(slug, projectId);
  if (!lp) notFound();

  // 公開プロダクトの構造化データ(SoftwareApplication)。description は generateMetadata と同じく
  // hero の sub から導出する(内部フィールドは公開面に出さない)。
  const heroSub = lp.blocks.find((b): b is HeroBlock => b.type === 'hero')?.sub;
  const description = heroSub?.trim() || `${lp.projectName} のランディングページ`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: lp.projectName,
    applicationCategory: 'WebApplication',
    description,
    url: `${getSiteUrl()}/p/${slug}/${projectId}`,
  };

  return (
    <main>
      <JsonLd data={jsonLd} />
      <LpRenderer blocks={lp.blocks} theme={lp.theme} />
    </main>
  );
}
