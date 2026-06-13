import type { MetadataRoute } from 'next';

import { listPublishedLandingPages } from '@/lib/api/workspaces';
import { getSiteUrl } from '@/lib/site-url';

/**
 * `/sitemap.xml`(F10、§9.12.2 観点 10)。
 *
 * 未認証で公開されるページのみ列挙する: マーケティング LP(`/`)+ 公開済みランディングページ(`/p/*`)。
 * 公開 LP は API から全テナント横断で動的取得する。API 失敗時は空配列にフォールバックして、
 * sitemap 自体(最低限 `/`)を壊さない。
 */
export const revalidate = 3600; // 公開 LP の増減を 1 時間で反映

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();

  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
  ];

  const published = await listPublishedLandingPages().catch(() => []);
  for (const lp of published) {
    entries.push({
      url: `${base}/p/${lp.slug}/${lp.projectId}`,
      lastModified: lp.publishedAt ? new Date(lp.publishedAt) : undefined,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  return entries;
}
