import type { DeliveryChannel } from '@shipyard/db';

/**
 * Sonnet 4 + Tool Use(`submit_announcement_drafts`)が返す多チャネル文面ドラフト(ADR-014)。
 * MVP は twitter + blog のみ、v1.x で email を追加する想定(`AnnouncementDrafts` のプロパティ追加だけで対応可能)。
 */
export interface AnnouncementDrafts {
  twitter: {
    /** 280 字以内、絵文字込み、hashtag は AI 判断 */
    text: string;
  };
  blog: {
    /** 60 字以内推奨(BLOG_TITLE_MAX = 120) */
    title: string;
    /** Markdown 本文(500〜2000 字目安、最低 BLOG_BODY_MIN = 100) */
    body: string;
    /** OG description 用、120 字以内推奨(BLOG_SUMMARY_MAX = 200) */
    summary: string;
  };
  // v1.x で追加予定:
  // email?: { subject: string; htmlBody: string; plainTextBody: string };
}

/** Delivery.content の TWITTER ペイロード(ADR-014)。 */
export interface TwitterDeliveryContent {
  text: string;
}

/** Delivery.content の BLOG ペイロード(BlogPost 本体は別 entity、ADR-014)。 */
export interface BlogDeliveryContent {
  blogPostId: string;
  summary: string;
}

/** Delivery.content の型を channel で discriminate するヘルパー(ADR-014)。 */
export type DeliveryContent =
  | { channel: 'TWITTER'; content: TwitterDeliveryContent }
  | { channel: 'BLOG'; content: BlogDeliveryContent };

/** channel の有効値(MVP)。`DeliveryChannel` enum と同期、配列順は UI 表示順(ADR-014)。 */
export const ANNOUNCEMENT_CHANNELS: readonly DeliveryChannel[] = ['TWITTER', 'BLOG'];
