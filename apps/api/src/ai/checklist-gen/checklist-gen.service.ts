import { Injectable } from '@nestjs/common';

import { Category } from '@shipyard/db';

import { AnthropicService } from '../_shared/anthropic.service';
import {
  AI_MODEL_HAIKU,
  CHECKLIST_GEN_MAX_ITEMS,
  CHECKLIST_GEN_MAX_TOKENS,
} from '../_shared/ai.constants';
import { AIBadResponseError } from '../_shared/ai-error';
import {
  CATEGORY_VALUES,
  buildChecklistItemsTool,
  parseChecklistItems,
  type GeneratedChecklist,
  type GeneratedChecklistItem,
} from '../_shared/checklist-items-tool';
import { formatReferenceSection, type RagReference } from '../_shared/format-reference';
import { AI_PERSONA_INTRO, taskItemGuidance } from '../_shared/prompts';
import { extractToolUseBlock } from '../_shared/tool-use';

interface ProjectContext {
  name: string;
  description: string | null;
  status: string;
}

/** `ChecklistGenService.generate` の引数。`references` は `RagSearchHit[]` をそのまま渡せる(`RagSearchHit extends RagReference`)。 */
export interface GenerateChecklistInput {
  project: ProjectContext;
  instructions?: string;
  /** 生成カテゴリの絞り込み(指定なしなら全カテゴリ)。 */
  categories?: Category[];
  references?: readonly RagReference[];
}

// 生成済み項目の型と検証は `checklist-items-tool.ts` に移した(F17 と共有するため)。
// 既存の import 経路を壊さないよう、ここから re-export し続ける。
export type { GeneratedChecklist, GeneratedChecklistItem };

/** Tool Use の構造化出力スキーマ。Haiku 4.5 にこれを呼ばせて、自由文ではなく構造化された配列を返させる。 */
const SUBMIT_CHECKLIST_TOOL = buildChecklistItemsTool({
  name: 'submit_checklist',
  description: 'リリース前チェックリストの項目一覧を提出する。',
  maxItems: CHECKLIST_GEN_MAX_ITEMS,
  titleExample: 'OG 画像を用意する',
});

/**
 * リリース前チェックリスト項目を Claude(Haiku 4.5)で生成する(CHECKLIST_GEN、ADR-005)。
 *
 * 構造化出力(`{ category, title, description? }[]`)が欲しいので Tool Use を使い、`tool_choice` で
 * `submit_checklist` の呼び出しを強制する。Haiku 4.5 は構造化中心の場面で安価・高速(ADR-005)。
 */
@Injectable()
export class ChecklistGenService {
  constructor(private readonly anthropic: AnthropicService) {}

  async generate(input: GenerateChecklistInput): Promise<GeneratedChecklist> {
    const { project, instructions, categories, references } = input;
    // categories は DTO の `@ArrayMinSize(1)` で空配列が弾かれているため、未指定 = undefined のみ全カテゴリにフォールバック。
    const targetCategories = categories ?? CATEGORY_VALUES;

    const systemPrompt = [
      AI_PERSONA_INTRO,
      '与えられたプロジェクト情報をもとに、リリース前にやるべきタスクを ChecklistItem の配列として',
      `submit_checklist ツールに渡してください。最大 ${CHECKLIST_GEN_MAX_ITEMS} 件まで。`,
      taskItemGuidance('OG 画像を用意する'),
      `カテゴリは ${targetCategories.join(' / ')} の中から選んでください。`,
      '優先度の高いものから順に並べてください。',
    ].join('\n');

    // RAG 参考(過去プロジェクトのドキュメント)。空(コールドスタート)なら何も注入しない。
    // CHECKLIST_GEN では「過去 README/LP に書かれた機能 → 抜けがちなタスクの示唆」として使う。
    // injection 対策の文言は format-reference.ts 側で自動付与される(SECURITY_GUIDANCE)。
    const referenceSection = formatReferenceSection(references, {
      usageHint:
        '以下は同じテナント内の過去ドキュメントです。記載された機能や運用から、抜けがちなチェック項目のヒントとして使ってください。',
    });

    const userText = [
      '# プロジェクト情報',
      `- 名前: ${project.name}`,
      `- 概要: ${project.description?.trim() || '(未記入)'}`,
      `- 状態: ${project.status}`,
      instructions ? `\n# 追加指示\n${instructions}` : '',
      referenceSection,
    ]
      .filter(Boolean)
      .join('\n');

    // 【Anthropic API 呼び出し】Haiku 4.5 にメッセージを送り、Tool Use で構造化出力を受け取る。
    const res = await this.anthropic.client.messages.create({
      model: AI_MODEL_HAIKU,
      max_tokens: CHECKLIST_GEN_MAX_TOKENS,
      system: systemPrompt,
      tools: [SUBMIT_CHECKLIST_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_CHECKLIST_TOOL.name },
      messages: [{ role: 'user', content: userText }],
    });

    const block = extractToolUseBlock(res, 'CHECKLIST_GEN');

    const items = parseChecklistItems(block.input, targetCategories, CHECKLIST_GEN_MAX_ITEMS);
    if (items.length === 0) {
      throw new AIBadResponseError('Claude returned no checklist items (CHECKLIST_GEN)');
    }

    return {
      items,
      model: AI_MODEL_HAIKU,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
    };
  }
}
