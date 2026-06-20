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
  // OG description は本文先頭 120 文字を抜粋(BlogPost に summary フィールドは持たないので)。
  const description = post.body.replace(/[#>*`_\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return {
    title: `${post.title} | ${post.project.name}`,
    description,
    openGraph: { title: post.title, description, type: 'article' },
    twitter: { card: 'summary', title: post.title, description },
  };
}

/**
 * `/p/blogs/{slug}/{projectId}/{postSlug}` — 公開ブログページ(ADR-014 §3)。
 *
 * 未認証で閲覧可能(Clerk middleware で公開ルートに登録される必要あり)。
 * `publishedAt = null`(下書き)は API 側で 404 → 区別なく `notFound()` する(未公開記事の存在を漏らさない)。
 */
export default async function PublicBlogPostPage({
  params,
}: {
  params: PublicBlogPostParams;
}) {
  const { slug, projectId, postSlug } = await params;
  const post = await fetchPublicBlogPost(slug, projectId, postSlug);
  if (!post) notFound();

  // 構造化データ(BlogPosting)。description は generateMetadata と揃える。
  const description = post.body.replace(/[#>*`_\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const canonicalUrl = `${getSiteUrl()}/p/blogs/${slug}/${projectId}/${postSlug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description,
    datePublished: post.publishedAt,
    url: canonicalUrl,
    isPartOf: {
      '@type': 'WebSite',
      name: post.project.name,
      url: `${getSiteUrl()}/p/${slug}/${projectId}`,
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
