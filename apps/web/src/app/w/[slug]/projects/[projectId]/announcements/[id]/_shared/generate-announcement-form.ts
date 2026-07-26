/**
 * Announcement 多チャネル文面 AI 生成 Server Action の共有型・定数(ADR-014)。
 * quotaExceeded フラグで Pro 誘導 CTA を出す分岐に使う。
 */

import { ANNOUNCEMENT_TOPIC_MAX, DELIVERY_CHANNELS, type DeliveryChannel } from '@/lib/api/types';

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

/**
 * topic の必須 + 長さ検証と channels の抽出。Server Action とクライアント事前検証で共有し、
 * 空送信をサーバ往復なしで弾く(生成ボタン文言のちらつき防止)。
 */
export function validateGenerateAnnouncementForm(formData: FormData): {
  data: { topic: string; channels: DeliveryChannel[] } | null;
  fieldErrors: NonNullable<GenerateAnnouncementFormState['fieldErrors']>;
  fields: { topic: string; channels: DeliveryChannel[] };
} {
  const topic = String(formData.get('topic') ?? '').trim();
  const rawChannels = formData.getAll('channels').map((v) => String(v));
  const channels = rawChannels.filter((c): c is DeliveryChannel =>
    (DELIVERY_CHANNELS as readonly string[]).includes(c),
  );
  const fields = { topic, channels };

  if (!topic) {
    return { data: null, fieldErrors: { topic: ['告知内容を入力してください。'] }, fields };
  }
  if (topic.length > ANNOUNCEMENT_TOPIC_MAX) {
    return {
      data: null,
      fieldErrors: {
        topic: [`告知内容は ${ANNOUNCEMENT_TOPIC_MAX} 文字以内で入力してください。`],
      },
      fields,
    };
  }
  return { data: { topic, channels }, fieldErrors: {}, fields };
}
