'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { updateBlogPost } from '@/lib/api/blog-posts';
import { ApiError, extractValidationMessages } from '@/lib/api/errors';

import {
  validateUpdateBlogPostForm,
  type UpdateBlogPostFormState,
} from '../_shared/update-blog-post-form';

/**
 * BlogPost 編集 Server Action(ADR-014、タイトル / 本文 / slug)。
 *
 * 公開状態の切り替えは Delivery 実行(`/announcements/:id/deliveries/:deliveryId/execute`)で
 * `publishedAt = now()` を行うため、本 Action では扱わない(下書きへ戻す UI も MVP では不要)。
 */
export async function updateBlogPostAction(
  slug: string,
  projectId: string,
  announcementId: string,
  blogPostId: string,
  _prev: UpdateBlogPostFormState,
  formData: FormData,
): Promise<UpdateBlogPostFormState> {
  void _prev;
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = validateUpdateBlogPostForm(formData);
  if (!parsed.data) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }
  const { title, body, slug: slugField } = parsed.data;

  try {
    await updateBlogPost(slug, projectId, blogPostId, {
      title,
      body,
      slug: slugField,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      const msgs = extractValidationMessages(e.body);
      if (e.status === 409) {
        return {
          ok: false,
          fieldErrors: {
            slug: [msgs[0] || 'この slug は既にこのプロジェクトで使われています。'],
          },
          fields: { title, body, slug: slugField },
        };
      }
      if (e.status === 403) {
        return {
          ok: false,
          formError: 'この記事を編集する権限がありません。',
          fields: { title, body, slug: slugField },
        };
      }
      if (e.status === 404) {
        return {
          ok: false,
          formError: '記事が見つかりません。',
          fields: { title, body, slug: slugField },
        };
      }
      if (e.status === 400 && msgs.length > 0) {
        return {
          ok: false,
          formError: msgs.join(' / '),
          fields: { title, body, slug: slugField },
        };
      }
      return {
        ok: false,
        formError: `記事の更新に失敗しました (HTTP ${e.status})`,
        fields: { title, body, slug: slugField },
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/announcements/${announcementId}`);
  // 公開ページ + sitemap も revalidate(タイトル / 本文 / slug の変更を反映)。
  // 旧 slug の URL は dynamic ルートかつ no-store fetch のため、自然に新コンテンツへ追従する。
  revalidatePath(`/p/${slug}/${projectId}/blog/${slugField}`);
  revalidatePath('/sitemap.xml');
  return { ok: true, fields: { title, body, slug: slugField } };
}
