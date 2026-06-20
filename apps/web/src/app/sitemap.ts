import type { MetadataRoute } from 'next';

import { listPublishedBlogPosts } from '@/lib/api/blog-posts';
import { listPublishedLandingPages } from '@/lib/api/workspaces';
import { getSiteUrl } from '@/lib/site-url';

/**
 * `/sitemap.xml`(F10、§9.12.2 観点 10)。
 *
 * 未認証で公開されるページのみ列挙する:
 *  - マーケティング LP(`/`)
 *  - 公開済みランディングページ(`/p/{slug}/{projectId}`)
 *  - 公開済みブログ記事(`/p/blogs/{slug}/{projectId}/{postSlug}`、ADR-014)
 *
 * API 失敗時は該当パートを空配列にフォールバックして、sitemap 自体(最低限 `/`)を壊さない。
 */
export const revalidate = 3600; // 公開 LP / ブログの増減を 1 時間で反映

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();

  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
  ];

  const [publishedLps, publishedBlogs] = await Promise.all([
    listPublishedLandingPages().catch(() => []),
    listPublishedBlogPosts().catch(() => []),
  ]);

  for (const lp of publishedLps) {
    entries.push({
      url: `${base}/p/${lp.slug}/${lp.projectId}`,
      lastModified: lp.publishedAt ? new Date(lp.publishedAt) : undefined,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  for (const post of publishedBlogs) {
    entries.push({
      url: `${base}/p/blogs/${post.slug}/${post.projectId}/${post.postSlug}`,
      lastModified: post.publishedAt ? new Date(post.publishedAt) : undefined,
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }

  return entries;
}
