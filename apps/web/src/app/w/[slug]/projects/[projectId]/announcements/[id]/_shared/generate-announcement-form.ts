/**
 * Announcement 多チャネル文面 AI 生成 Server Action の共有型・定数(ADR-014)。
 * quotaExceeded フラグで Pro 誘導 CTA を出す分岐に使う。
 */

import type { DeliveryChannel } from '@/lib/api/types';

export interface GenerateAnnouncementFormState {
  ok: boolean;
  fieldErrors?: { topic?: string[]; channels?: string[] };
  formError?: string;
  /** Free 上限到達時のみ true。 */
  quotaExceeded?: boolean;
  fields?: { topic?: string; channels?: DeliveryChannel[] };
}

export const INITIAL_GENERATE_ANNOUNCEMENT_FORM_STATE: GenerateAnnouncementFormState = {
  ok: false,
};
