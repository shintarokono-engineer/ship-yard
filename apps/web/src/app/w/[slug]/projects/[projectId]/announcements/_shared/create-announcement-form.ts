/** Announcement 新規作成 Server Action の共有型・定数(ADR-014)。 */

export interface CreateAnnouncementFormState {
  ok: boolean;
  fieldErrors?: { title?: string[] };
  formError?: string;
  fields?: { title?: string };
}

export const INITIAL_CREATE_ANNOUNCEMENT_FORM_STATE: CreateAnnouncementFormState = { ok: false };
