/**
 * BlogPost 編集 Server Action の共有型・定数(ADR-014)。
 * title / body / slug の 3 fieldErrors + fields shape。
 */

import { BLOG_BODY_MAX, BLOG_BODY_MIN, BLOG_SLUG_MAX, BLOG_TITLE_MAX } from '@/lib/api/types';

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

/** slug の許容パターン(半角小文字 + 数字 + ハイフン)。 */
export const BLOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * title / body / slug の必須・長さ・パターン検証。Server Action とクライアント事前検証で
 * 共有し、空送信をサーバ往復なしで弾く(ちらつき防止)。body は末尾空白のみ除去(全 trim しない)。
 */
export function validateUpdateBlogPostForm(formData: FormData): {
  data: { title: string; body: string; slug: string } | null;
  fieldErrors: NonNullable<UpdateBlogPostFormState['fieldErrors']>;
  fields: { title: string; body: string; slug: string };
} {
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
  } else if (!BLOG_SLUG_PATTERN.test(slugField)) {
    fieldErrors.slug = ['slug は半角小文字 + 数字 + ハイフンのみ使用できます。'];
  }

  const fields = { title, body, slug: slugField };
  if (Object.keys(fieldErrors).length > 0) {
    return { data: null, fieldErrors, fields };
  }
  return { data: { title, body, slug: slugField }, fieldErrors, fields };
}
