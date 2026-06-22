import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { JsonLd } from '@/components/json-ld';
import { MarkdownViewer } from '@/components/markdown-viewer';
import { fetchPublicBlogPost } from '@/lib/api/blog-posts';
import { formatDate } from '@/lib/format';
import { getSiteUrl } from '@/lib/site-url';

type PublicBlogPostParams = Promise<{ slug: string; projectId: string; postSlug: string }>;

/** OG description 抽出最大文字数。 */
const DESCRIPTION_MAX = 120;

/**
 * BlogPost.body(Markdown)から OG / SEO 用の description を抽出する。
 * Markdown 記号(# > * ` _ -)を除去し、空白を 1 文字に正規化、先頭 120 字でカット。
 * BlogPost には `summary` カラムを持たないため、本文先頭からの抜粋で代用する。
 */
function extractDescription(body: string): string {
  return body
    .replace(/[#>*`_\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DESCRIPTION_MAX);
}

/** 公開ブログの OG / SEO メタ。`fetchPublicBlogPost` は `React.cache` 済み(本体描画と HTTP は 1 回)。 */
export async function generateMetadata({
  params,
}: {
  params: PublicBlogPostParams;
}): Promise<Metadata> {
  const { slug, projectId, postSlug } = await params;
  const post = await fetchPublicBlogPost(slug, projectId, postSlug);
  if (!post) {
    return { title: 'ページが見つかりません' };
  }
  const description = extractDescription(post.body);
  return {
    title: `${post.title} | ${post.project.name}`,
    description,
    openGraph: { title: post.title, description, type: 'article' },
    twitter: { card: 'summary', title: post.title, description },
  };
}

/**
 * `/p/{slug}/{projectId}/blog/{postSlug}` — 公開ブログページ(ADR-014 §3)。
 *
 * 未認証で閲覧可能(Clerk middleware の `/p/(.*)` 公開ルートでカバー)。
 * `publishedAt = null`(下書き)は API 側で 404 → 区別なく `notFound()` する(未公開記事の存在を漏らさない)。
 * 本文の XSS は `MarkdownViewer.safeUrlTransform` で `javascript:` 等の危険スキームをブロック。
 */
export default async function PublicBlogPostPage({
  params,
}: {
  params: PublicBlogPostParams;
}) {
  const { slug, projectId, postSlug } = await params;
  const post = await fetchPublicBlogPost(slug, projectId, postSlug);
  if (!post) notFound();

  // 構造化データ(BlogPosting)。description は generateMetadata と同じ純粋関数を再利用。
  const siteUrl = getSiteUrl();
  const description = extractDescription(post.body);
  const canonicalUrl = `${siteUrl}/p/${slug}/${projectId}/blog/${postSlug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description,
    datePublished: post.publishedAt,
    url: canonicalUrl,
    author: {
      '@type': 'Organization',
      name: post.project.name,
      url: `${siteUrl}/p/${slug}/${projectId}`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Shipyard',
      url: siteUrl,
    },
    isPartOf: {
      '@type': 'WebSite',
      name: post.project.name,
      url: `${siteUrl}/p/${slug}/${projectId}`,
    },
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <JsonLd data={jsonLd} />

      <Link
        href={`/p/${slug}/${projectId}`}
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {post.project.name} へ戻る
      </Link>

      <article className="space-y-6">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold leading-tight md:text-4xl">{post.title}</h1>
          <p className="text-muted-foreground text-sm">
            公開日 {formatDate(post.publishedAt)}
          </p>
        </header>

        <MarkdownViewer source={post.body} />
      </article>
    </main>
  );
}
