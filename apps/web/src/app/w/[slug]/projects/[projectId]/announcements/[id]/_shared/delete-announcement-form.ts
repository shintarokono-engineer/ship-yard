/**
 * Announcement 削除 Server Action の共有型・定数(ADR-014、Next.js 15 の 'use server' 制約対応)。
 */

export interface DeleteAnnouncementFormState {
  ok: boolean;
  formError?: string;
}

export const INITIAL_DELETE_ANNOUNCEMENT_FORM_STATE: DeleteAnnouncementFormState = { ok: false };
