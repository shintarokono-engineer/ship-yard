/**
 * Announcement 更新 Server Action の共有型・定数(ADR-014、Next.js 15 の 'use server' 制約対応)。
 * タイトル / Twitter content の 1 Action 2 用途に対応する fieldErrors + fields shape。
 */

export interface UpdateAnnouncementFormState {
  ok: boolean;
  fieldErrors?: { title?: string[]; twitterText?: string[] };
  formError?: string;
  fields?: { title?: string; twitterText?: string };
}

export const INITIAL_UPDATE_ANNOUNCEMENT_FORM_STATE: UpdateAnnouncementFormState = { ok: false };
