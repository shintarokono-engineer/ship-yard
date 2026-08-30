import { Injectable } from '@nestjs/common';

import { AnthropicService } from '../_shared/anthropic.service';
import {
  AI_MODEL_HAIKU,
  SUGGESTION_TASKS_MAX_ITEMS,
  SUGGESTION_TASKS_MAX_TOKENS,
} from '../_shared/ai.constants';
import { AIBadResponseError } from '../_shared/ai-error';
import {
  CATEGORY_VALUES,
  buildChecklistItemsTool,
  parseChecklistItems,
  type GeneratedChecklist,
} from '../_shared/checklist-items-tool';
import {
  buildSuggestionTasksPrompt,
  type SuggestionTasksPromptInput,
} from './suggestion-tasks.prompt';
import { extractToolUseBlock } from '../_shared/tool-use';

/**
 * 改善提案を実行可能な ChecklistItem へ分解する(F17、ADR-013 / ADR-005)。
 *
 * CHECKLIST_GEN と同じ構造(`{ category, title, description? }[]`)を返すため Tool のスキーマと
 * 検証は `checklist-items-tool.ts` を共有し、目的が違うプロンプトだけ
 * `suggestion-tasks.prompt.ts` に分けている。
 *
 * 構造化出力が要るので Tool Use を使い、`tool_choice` で呼び出しを強制する。
 * モデルは Haiku 4.5(構造化中心の変換なので Sonnet を使う理由がない、ADR-005)。
 *
 * RAG 参考は渡さない。CHECKLIST_GEN の RAG は薄い入力(name + description)を補強するのが目的で、
 * こちらの入力は提案本文が既に具体的なため寄与が小さい。代わりに既存 ChecklistItem の title を
 * プロンプトに載せて重複生成を抑える。
 */

/** `buildSuggestionTasksPrompt` の入力をそのまま受ける(Service 独自の引数は無い)。 */
export type GenerateSuggestionTasksInput = SuggestionTasksPromptInput;

/** Tool Use の構造化出力スキーマ。 */
const SUBMIT_SUGGESTION_TASKS_TOOL = buildChecklistItemsTool({
  name: 'submit_suggestion_tasks',
  description: '改善提案を分解して得たチェックリスト項目の一覧を提出する。',
  maxItems: SUGGESTION_TASKS_MAX_ITEMS,
  titleExample: 'LP のヒーローコピーを書き直す',
});

@Injectable()
export class SuggestionTasksService {
  constructor(private readonly anthropic: AnthropicService) {}

  async generate(input: GenerateSuggestionTasksInput): Promise<GeneratedChecklist> {
    const { system, user } = buildSuggestionTasksPrompt(input);

    // 【Anthropic API 呼び出し】Haiku 4.5 にメッセージを送り、Tool Use で構造化出力を受け取る。
    const res = await this.anthropic.client.messages.create({
      model: AI_MODEL_HAIKU,
      max_tokens: SUGGESTION_TASKS_MAX_TOKENS,
      system,
      tools: [SUBMIT_SUGGESTION_TASKS_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_SUGGESTION_TASKS_TOOL.name },
      messages: [{ role: 'user', content: user }],
    });

    const block = extractToolUseBlock(res, 'SUGGESTION_TASKS');

    // カテゴリは項目ごとに AI が選ぶ(F17 の主目的が「跨る提案を領域ごとに分ける」ことなので絞らない)。
    const items = parseChecklistItems(block.input, CATEGORY_VALUES, SUGGESTION_TASKS_MAX_ITEMS);
    if (items.length === 0) {
      throw new AIBadResponseError('Claude returned no checklist items (SUGGESTION_TASKS)');
    }

    return {
      items,
      model: AI_MODEL_HAIKU,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
    };
  }
}
