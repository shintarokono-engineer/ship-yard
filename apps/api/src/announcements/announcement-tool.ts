import type Anthropic from '@anthropic-ai/sdk';

import {
  BLOG_BODY_MAX,
  BLOG_BODY_MIN,
  BLOG_SUMMARY_MAX,
  BLOG_TITLE_MAX,
  TWITTER_TEXT_MAX,
} from './announcement.constants';
import type { AnnouncementDrafts } from './announcement-types';

/**
 * Anthropic Tool Use の input_schema(ADR-014)。
 *
 * Sonnet 4 に「強制で」 この形で出力させる:`tool_choice: { type: 'tool', name: SUBMIT_ANNOUNCEMENT_DRAFTS_TOOL.name }`。
 * channel ごとに別呼び出しせず、1 回の API call で twitter + blog の両方を生成することで Tool Use の往復を 1 回に抑える。
 */
export const SUBMIT_ANNOUNCEMENT_DRAFTS_TOOL: Anthropic.Messages.Tool = {
  name: 'submit_announcement_drafts',
  description:
    'マルチチャネル告知配信の文面ドラフトを提出する。Twitter(280 字)と Blog(Markdown 本文)を一括で。',
  input_schema: {
    type: 'object',
    required: ['twitter', 'blog'],
    properties: {
      twitter: {
        type: 'object',
        required: ['text'],
        properties: {
          text: {
            type: 'string',
            maxLength: TWITTER_TEXT_MAX,
            description: '280 字以内の Tweet 本文。絵文字 1-2 個 + hashtag 1-2 個推奨。',
          },
        },
      },
      blog: {
        type: 'object',
        required: ['title', 'body', 'summary'],
        properties: {
          title: {
            type: 'string',
            maxLength: BLOG_TITLE_MAX,
            description: 'ブログ記事タイトル(60 字以内推奨)。',
          },
          body: {
            type: 'string',
            minLength: BLOG_BODY_MIN,
            maxLength: BLOG_BODY_MAX,
            description:
              'Markdown 本文。h2 / h3 見出し構造、リード → 機能 → CTA、画像はプレースホルダ ![alt](TODO)。',
          },
          summary: {
            type: 'string',
            maxLength: BLOG_SUMMARY_MAX,
            description: 'OG description 用の要約(120 字以内推奨)。',
          },
        },
      },
    },
  },
};

/**
 * Tool Use の `input` を `AnnouncementDrafts` 型として安全に取り出す(ADR-014)。
 *
 * Anthropic の Tool Use は input_schema で型バリデーションを通してくれるが、
 * LLM が JSON Schema を破る可能性(欠落 / 型違い / maxLength 超過)があるため、
 * Service 層でも防御チェックする(280 字超 Twitter / 100 字未満 Blog body などを ad hoc に弾く)。
 *
 * エラー文言は `(ANNOUNCEMENT_GEN)` 接尾を付けて Sentry / log での識別を容易にする。
 */
export function parseAnnouncementDrafts(input: unknown): AnnouncementDrafts {
  const obj = input as Partial<AnnouncementDrafts> | null | undefined;
  const twitter = obj?.twitter;
  const blog = obj?.blog;

  if (!twitter || typeof twitter.text !== 'string') {
    throw new Error('Tool output missing twitter.text (ANNOUNCEMENT_GEN)');
  }
  if (twitter.text.length === 0 || twitter.text.length > TWITTER_TEXT_MAX) {
    throw new Error(
      `twitter.text length ${twitter.text.length} out of range [1, ${TWITTER_TEXT_MAX}] (ANNOUNCEMENT_GEN)`,
    );
  }

  if (
    !blog ||
    typeof blog.title !== 'string' ||
    typeof blog.body !== 'string' ||
    typeof blog.summary !== 'string'
  ) {
    throw new Error('Tool output missing blog.{title, body, summary} (ANNOUNCEMENT_GEN)');
  }
  if (blog.title.length === 0 || blog.title.length > BLOG_TITLE_MAX) {
    throw new Error(
      `blog.title length ${blog.title.length} out of range [1, ${BLOG_TITLE_MAX}] (ANNOUNCEMENT_GEN)`,
    );
  }
  if (blog.body.length < BLOG_BODY_MIN || blog.body.length > BLOG_BODY_MAX) {
    throw new Error(
      `blog.body length ${blog.body.length} out of range [${BLOG_BODY_MIN}, ${BLOG_BODY_MAX}] (ANNOUNCEMENT_GEN)`,
    );
  }
  if (blog.summary.length > BLOG_SUMMARY_MAX) {
    throw new Error(
      `blog.summary length ${blog.summary.length} exceeds max ${BLOG_SUMMARY_MAX} (ANNOUNCEMENT_GEN)`,
    );
  }

  return {
    twitter: { text: twitter.text },
    blog: { title: blog.title, body: blog.body, summary: blog.summary },
  };
}
