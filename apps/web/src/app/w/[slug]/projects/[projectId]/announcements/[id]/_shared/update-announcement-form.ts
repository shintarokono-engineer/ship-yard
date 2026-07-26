/**
 * Announcement 更新 Server Action の共有型・定数(ADR-014)。
 * タイトル / Twitter content の 1 Action 2 用途に対応する fieldErrors + fields shape。
 */

import { ANNOUNCEMENT_TITLE_MAX, TWITTER_TEXT_MAX } from '@/lib/api/types';

export interface UpdateAnnouncementFormState {
  ok: boolean;
  fieldErrors?: { title?: string[]; twitterText?: string[] };
  formError?: string;
  fields?: { title?: string; twitterText?: string };
}

export const INITIAL_UPDATE_ANNOUNCEMENT_FORM_STATE: UpdateAnnouncementFormState = { ok: false };

/**
 * title / twitterText の必須 + 長さ検証(field で用途を切替)。Server Action と
 * クライアント事前検証で共有し、空送信をサーバ往復なしで弾く(ちらつき防止)。
 */
export function validateUpdateAnnouncementForm(
  field: 'title' | 'twitter',
  formData: FormData,
): {
  data: { title?: string; twitterContent?: { text: string } } | null;
  fieldErrors: NonNullable<UpdateAnnouncementFormState['fieldErrors']>;
  fields: { title?: string; twitterText?: string };
} {
  const titleRaw = String(formData.get('title') ?? '').trim();
  const twitterRaw = String(formData.get('twitterText') ?? '').trim();

  if (field === 'title') {
    const fields = { title: titleRaw };
    if (!titleRaw) {
      return { data: null, fieldErrors: { title: ['タイトルを入力してください。'] }, fields };
    }
    if (titleRaw.length > ANNOUNCEMENT_TITLE_MAX) {
      return {
        data: null,
        fieldErrors: {
          title: [`タイトルは ${ANNOUNCEMENT_TITLE_MAX} 文字以内で入力してください。`],
        },
        fields,
      };
    }
    return { data: { title: titleRaw }, fieldErrors: {}, fields };
  }

  const fields = { twitterText: twitterRaw };
  if (!twitterRaw) {
    return { data: null, fieldErrors: { twitterText: ['本文を入力してください。'] }, fields };
  }
  if (twitterRaw.length > TWITTER_TEXT_MAX) {
    return {
      data: null,
      fieldErrors: {
        twitterText: [`X の本文は ${TWITTER_TEXT_MAX} 文字以内で入力してください。`],
      },
      fields,
    };
  }
  return { data: { twitterContent: { text: twitterRaw } }, fieldErrors: {}, fields };
}
