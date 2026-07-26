/** Announcement 新規作成 Server Action の共有型・定数(ADR-014)。 */

import { ANNOUNCEMENT_TITLE_MAX } from '@/lib/api/types';

export interface CreateAnnouncementFormState {
  ok: boolean;
  fieldErrors?: { title?: string[] };
  formError?: string;
  fields?: { title?: string };
}

export const INITIAL_CREATE_ANNOUNCEMENT_FORM_STATE: CreateAnnouncementFormState = { ok: false };

/**
 * title の必須 + 長さ検証。Server Action とクライアント事前検証で共有し、
 * 空送信などをサーバ往復なしで弾く(送信ボタン文言のちらつき防止)。
 */
export function validateCreateAnnouncementForm(formData: FormData): {
  data: { title: string } | null;
  fieldErrors: NonNullable<CreateAnnouncementFormState['fieldErrors']>;
  fields: { title: string };
} {
  const title = String(formData.get('title') ?? '').trim();
  const fieldErrors: NonNullable<CreateAnnouncementFormState['fieldErrors']> = {};

  if (!title) {
    fieldErrors.title = ['タイトルを入力してください。'];
  } else if (title.length > ANNOUNCEMENT_TITLE_MAX) {
    fieldErrors.title = [`タイトルは ${ANNOUNCEMENT_TITLE_MAX} 文字以内で入力してください。`];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { data: null, fieldErrors, fields: { title } };
  }
  return { data: { title }, fieldErrors, fields: { title } };
}
