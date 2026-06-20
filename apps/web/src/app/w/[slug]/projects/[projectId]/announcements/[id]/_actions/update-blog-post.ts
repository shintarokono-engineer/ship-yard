'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { updateBlogPost } from '@/lib/api/blog-posts';
import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import {
  BLOG_BODY_MAX,
  BLOG_BODY_MIN,
  BLOG_SLUG_MAX,
  BLOG_TITLE_MAX,
} from '@/lib/api/types';

export interface UpdateBlogPostFormState {
  ok: boolean;
  fieldErrors?: {
    title?: string[];
    body?: string[];
    slug?: string[];
  };
  formError?: string;
  fields?: { title?: string; body?: string; slug?: string };
}

export const INITIAL_UPDATE_BLOG_POST_FORM_STATE: UpdateBlogPostFormState = { ok: false };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').replace(/\s+$/, '');
  const slugField = String(formData.get('slug') ?? '').trim();

  const fieldErrors: NonNullable<UpdateBlogPostFormState['fieldErrors']> = {};

  if (!title) {
    fieldErrors.title = ['タイトルを入力してください。'];
  } else if (title.length > BLOG_TITLE_MAX) {
    fieldErrors.title = [`タイトルは ${BLOG_TITLE_MAX} 文字以内で入力してください。`];
  }

  if (body.length < BLOG_BODY_MIN) {
    fieldErrors.body = [`本文は ${BLOG_BODY_MIN} 文字以上で入力してください。`];
  } else if (body.length > BLOG_BODY_MAX) {
    fieldErrors.body = [`本文は ${BLOG_BODY_MAX.toLocaleString()} 文字以内で入力してください。`];
  }

  if (!slugField) {
    fieldErrors.slug = ['slug を入力してください。'];
  } else if (slugField.length > BLOG_SLUG_MAX) {
    fieldErrors.slug = [`slug は ${BLOG_SLUG_MAX} 文字以内で入力してください。`];
  } else if (!SLUG_PATTERN.test(slugField)) {
    fieldErrors.slug = ['slug は半角小文字 + 数字 + ハイフンのみ使用できます。'];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, fields: { title, body, slug: slugField } };
  }

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
  return { ok: true, fields: { title, body, slug: slugField } };
}
