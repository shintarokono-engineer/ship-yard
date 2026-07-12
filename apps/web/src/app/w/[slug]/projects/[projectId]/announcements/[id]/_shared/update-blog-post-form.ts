/**
 * BlogPost 編集 Server Action の共有型・定数(ADR-014)。
 * title / body / slug の 3 fieldErrors + fields shape。
 */

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
