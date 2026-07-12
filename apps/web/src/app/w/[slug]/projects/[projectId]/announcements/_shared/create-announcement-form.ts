/**
 * Announcement 新規作成 Server Action の共有型・定数(ADR-014)。
 *
 * Next.js 15 の `'use server'` ファイルは **async 関数のみ export 可能** なので、
 * 型 / 定数は本ファイル(通常の module)に分離する。
 */

export interface CreateAnnouncementFormState {
  ok: boolean;
  fieldErrors?: { title?: string[] };
  formError?: string;
  fields?: { title?: string };
}

export const INITIAL_CREATE_ANNOUNCEMENT_FORM_STATE: CreateAnnouncementFormState = { ok: false };
