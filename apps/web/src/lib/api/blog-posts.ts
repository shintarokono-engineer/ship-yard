import { cache } from 'react';

import { apiFetch } from './client';
import { ApiError } from './errors';
import type { BlogPost, PublicBlogPost } from './types';

/**
 * BlogPost(ADR-014)管理 API クライアント + 公開 API クライアント。
 *
 * - 管理(`/workspaces/:slug/projects/:projectId/blog-posts`):認証付。閲覧は所属メンバー全員、編集は WRITER_ROLES。
 * - 公開(`/public/blog-posts/...`):skipAuth で未認証アクセス可。公開済(`publishedAt != null`)のみ返る。
 */

const base = (slug: string, projectId: string) =>
  `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/blog-posts`;

/** `GET .../blog-posts` — プロジェクト配下の BlogPost 一覧(下書き含む、新しい順)。 */
export async function listBlogPosts(slug: string, projectId: string): Promise<BlogPost[]> {
  const res = await apiFetch<{ posts: BlogPost[] }>(base(slug, projectId));
  return res.posts;
}

/** `GET .../blog-posts/:id` — 単一 BlogPost(編集画面初期表示)。不在 / 他テナント = 404 / 401 → null。 */
export const fetchBlogPost = cache(
  async (slug: string, projectId: string, id: string): Promise<BlogPost | null> => {
    try {
      return await apiFetch<BlogPost>(`${base(slug, projectId)}/${encodeURIComponent(id)}`);
    } catch (e) {
      // 既存 fetchWorkspace / fetchProject 等と同じく 404 / 401(未所属)も null に変換する。
      if (e instanceof ApiError && (e.status === 404 || e.status === 401)) return null;
      throw e;
    }
  },
);

/**
 * `PATCH .../blog-posts/:id` — タイトル / 本文 / slug / 公開状態 を編集。
 * slug 重複は 409(`ApiError.status === 409`)で返るので呼び出し側で文言案内すること。
 */
export async function updateBlogPost(
  slug: string,
  projectId: string,
  id: string,
  body: {
    title?: string;
    body?: string;
    slug?: string;
    published?: boolean;
  },
): Promise<BlogPost> {
  return apiFetch<BlogPost>(`${base(slug, projectId)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** 公開済 BlogPost(`GET /public/blog-posts` で sitemap 用に返す最小情報)。 */
export interface PublishedBlogPostRef {
  slug: string;
  projectId: string;
  postSlug: string;
  publishedAt: string;
}

/**
 * `GET /public/blog-posts` — 公開済ブログを全テナント横断で列挙する(sitemap.xml 用、F10)。
 * 未認証(`skipAuth: true`)。失敗時は sitemap を壊さないよう呼び出し側で `.catch(() => [])` する。
 */
export async function listPublishedBlogPosts(): Promise<PublishedBlogPostRef[]> {
  return apiFetch<PublishedBlogPostRef[]>('/public/blog-posts', { skipAuth: true });
}

/**
 * 公開 API:`GET /public/blog-posts/:slug/:projectId/:postSlug`。
 * 未認証(`skipAuth: true`)。下書き / 不在は 404 → null。
 *
 * `React.cache` でリクエスト内 dedup(`generateMetadata` と page の双方から呼んでも HTTP 1 回)。
 */
export const fetchPublicBlogPost = cache(
  async (
    slug: string,
    projectId: string,
    postSlug: string,
  ): Promise<PublicBlogPost | null> => {
    try {
      return await apiFetch<PublicBlogPost>(
        `/public/blog-posts/${encodeURIComponent(slug)}/${encodeURIComponent(projectId)}/${encodeURIComponent(postSlug)}`,
        { skipAuth: true },
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
);
