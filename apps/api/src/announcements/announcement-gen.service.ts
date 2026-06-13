import { Injectable } from '@nestjs/common';

import {
  AI_MODEL_SONNET,
  ANNOUNCEMENT_GEN_MAX_TOKENS,
  ANNOUNCEMENT_GEN_TEMPERATURE,
} from '../ai/ai.constants';
import { AIBadResponseError } from '../ai/ai-error';
import { AnthropicService } from '../ai/anthropic.service';
import { AI_PERSONA_INTRO } from '../ai/prompts';
import { extractToolUseBlock } from '../ai/tool-use';

import { parseAnnouncementDrafts, SUBMIT_ANNOUNCEMENT_DRAFTS_TOOL } from './announcement-tool';
import { ANNOUNCEMENT_CHANNELS } from './announcement-types';
import type { AnnouncementDrafts } from './announcement-types';

/** プロンプトに差し込むプロジェクト情報(必須・任意混在、空欄は文言で代替する)。 */
interface ProjectContext {
  name: string;
  description: string | null;
  categoryDomain: string | null;
  pricingTier: string | null;
  targetUsers: string | null;
  problemStatement: string | null;
  proposedFeatures: string | null;
  pricingModel: string | null;
}

export interface GenerateAnnouncementInput {
  /** ユーザーが今回伝えたい告知トピック(主入力)。 */
  topic: string;
  /** プロジェクトの基本情報(参照コンテキスト)。 */
  project: ProjectContext;
  /** 内部管理用 Announcement.title(配信文面には含めない参考情報)。 */
  announcementTitle: string;
  /**
   * 部分再生成したいチャネル(省略時は ANNOUNCEMENT_CHANNELS 全体)。
   * 部分再生成でも 1 回の Tool Use API call 固定(全 channel 出力 → 不要分は呼び出し側で破棄)。
   */
  channels?: ReadonlyArray<'TWITTER' | 'BLOG'>;
  /** 最新 LP の hero ブロック抜粋(トーン参考)。 */
  latestLpHero?: { heading: string; sub?: string };
  /** 最新 README の冒頭(機能概要の参考、300 字程度に丸めて使う)。 */
  latestReadmeExcerpt?: string;
}

export interface GeneratedAnnouncement {
  drafts: AnnouncementDrafts;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

/**
 * 1 Announcement → Twitter 文 + Blog 本文を Sonnet 4 + Tool Use で一括生成する(ADR-014 §2)。
 *
 * - 既存 DRAFT_GEN(`ProjectDocument` 経路、README 専用)とは別経路。本サービスは多チャネル文面
 *   ドラフトを返すのみで、永続化(`Delivery.content` / `BlogPost`)は AnnouncementService 側で行う。
 * - 部分再生成(channels 指定)もコスト・LLM コールは 1 回固定(全 channel 出力 → 必要分のみ採用)。
 * - Tool Use 強制(`tool_choice: { type: 'tool', name: ... }`)で出力フォーマットを保証。
 */
@Injectable()
export class AnnouncementGenService {
  constructor(private readonly anthropic: AnthropicService) {}

  async generate(input: GenerateAnnouncementInput): Promise<GeneratedAnnouncement> {
    const { topic, project, announcementTitle, channels, latestLpHero, latestReadmeExcerpt } =
      input;
    const activeChannels = channels && channels.length > 0 ? channels : ANNOUNCEMENT_CHANNELS;

    const systemPrompt = [
      AI_PERSONA_INTRO,
      '与えられたプロジェクト情報と告知トピックをもとに、Twitter と Blog の文面を一括で作成してください。',
      `生成対象チャネル: ${activeChannels.join(', ')}(指定外チャネルは出力しても無視されますが、最小限の文字数で構いません)`,
      '',
      '## Twitter のガイドライン',
      '- 280 字以内、簡潔に。プロダクト名 + 1 行訴求 + LP URL の構成を基本とする。',
      '- hashtag は 1-2 個、関連性が高いもの。',
      '- 絵文字 1-2 個でトーンを軽くする(過剰禁止)。',
      '',
      '## Blog のガイドライン',
      '- Markdown 本文、h2 / h3 見出し構造で読みやすく。',
      '- 構成:リード文 → 解決する課題 → 提供機能 → CTA。500-2000 字目安。',
      '- 画像が必要な箇所は `![説明](TODO)` のプレースホルダを置く(ユーザーが後で差し替える前提)。',
      '- 内部リンクは LP URL のみ(他は架空 URL を作らない)。',
      '',
      '## トーン統一',
      `- categoryDomain="${project.categoryDomain ?? '未設定'}" に合わせて自然に。`,
      '  - ENTERTAINMENT / LIFESTYLE / SOCIAL → 親しみやすく口語的に',
      '  - DEVELOPER_TOOL / PRODUCTIVITY → 技術的・端的に',
      '  - FINANCE / HEALTH / EDUCATION → 信頼感のある丁寧な文体に',
    ].join('\n');

    const lpSection = latestLpHero
      ? `\n## 最新 LP の hero(参考トーン)\n- heading: ${latestLpHero.heading}\n- sub: ${latestLpHero.sub ?? ''}`
      : '';
    const readmeSection = latestReadmeExcerpt
      ? `\n## 最新 README 抜粋(参考機能)\n${latestReadmeExcerpt.slice(0, 300)}`
      : '';

    const userText = [
      '# プロジェクト情報',
      `- 名前: ${project.name}`,
      `- 概要: ${project.description ?? '(未記入)'}`,
      `- カテゴリ: ${project.categoryDomain ?? '(未指定)'}`,
      `- 価格帯: ${project.pricingTier ?? '(未指定)'}`,
      `- 想定ユーザー: ${project.targetUsers ?? '(未記入)'}`,
      `- 解決課題: ${project.problemStatement ?? '(未記入)'}`,
      `- 提供機能: ${project.proposedFeatures ?? '(未記入)'}`,
      `- 課金モデル補足: ${project.pricingModel ?? '(未記入)'}`,
      lpSection,
      readmeSection,
      '',
      '# 告知の内部タイトル(参考、配信文面には含めない)',
      announcementTitle,
      '',
      '# 今回の告知トピック(これを伝えたい)',
      topic,
    ]
      .filter(Boolean)
      .join('\n');

    const res = await this.anthropic.client.messages.create({
      model: AI_MODEL_SONNET,
      max_tokens: ANNOUNCEMENT_GEN_MAX_TOKENS,
      temperature: ANNOUNCEMENT_GEN_TEMPERATURE,
      system: systemPrompt,
      tools: [SUBMIT_ANNOUNCEMENT_DRAFTS_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_ANNOUNCEMENT_DRAFTS_TOOL.name },
      messages: [{ role: 'user', content: userText }],
    });

    const block = extractToolUseBlock(res, 'ANNOUNCEMENT_GEN');
    let drafts: AnnouncementDrafts;
    try {
      drafts = parseAnnouncementDrafts(block.input);
    } catch (err) {
      throw new AIBadResponseError(`ANNOUNCEMENT_GEN: ${(err as Error).message}`, {
        cause: err as Error,
      });
    }

    return {
      drafts,
      model: AI_MODEL_SONNET,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
    };
  }
}
