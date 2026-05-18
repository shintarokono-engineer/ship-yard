import { Injectable } from '@nestjs/common';

import { Category } from '@shipyard/db';

import { AnthropicService } from './anthropic.service';
import { AI_MODEL_HAIKU, TASK_SPLIT_MAX_ITEMS, TASK_SPLIT_MAX_TOKENS } from './ai.constants';
import { formatReferenceSection, type RagReference } from './format-reference';

interface ProjectContext {
  name: string;
  description: string | null;
  status: string;
}

/** 分解対象の親タスク(ChecklistItem の {title, description, category} だけ抜き出した形)。 */
interface ParentTask {
  title: string;
  description: string | null;
  category: Category;
}

/** `TaskSplitService.split` の引数。`references` は `RagSearchHit[]` をそのまま渡せる(`RagSearchHit extends RagReference`)。 */
export interface SplitTaskInput {
  project: ProjectContext;
  parent: ParentTask;
  instructions?: string;
  references?: readonly RagReference[];
}

/** 1 件の生成済みサブタスク(DB 保存前の中間表現)。Category は親から継承するため含まない。 */
export interface GeneratedSubtask {
  title: string;
  /** 任意。AI が必要と判断したら埋める。 */
  description?: string;
}

/** 生成結果 + AIUsage 記録用のトークン数。 */
export interface SplitTaskResult {
  items: GeneratedSubtask[];
  model: string;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Tool Use の構造化出力スキーマ。Haiku 4.5 にこれを呼ばせて、自由文ではなく構造化された配列を返させる。
 * Category は親 ChecklistItem から継承する仕様のため、Tool スキーマには含めない(誤分類リスク低減 + プロンプト簡潔化)。
 */
const SUBMIT_SUBTASKS_TOOL = {
  name: 'submit_subtasks',
  description: '親タスクを分解したサブタスクの一覧を提出する。',
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array' as const,
        maxItems: TASK_SPLIT_MAX_ITEMS,
        items: {
          type: 'object' as const,
          properties: {
            title: {
              type: 'string' as const,
              maxLength: 200,
              description: '実行可能な短い動詞句(例: 「サインアップ画面のレイアウトを実装する」)',
            },
            description: {
              type: 'string' as const,
              maxLength: 2000,
              description: '補足が要るときだけ書く。不要なら省略する',
            },
          },
          required: ['title'],
        },
      },
    },
    required: ['items'],
  },
};

/**
 * 1 つの大きなタスク(親 ChecklistItem)を実行可能なサブタスクの配列に分解する(TASK_SPLIT、ADR-005、Day 15)。
 *
 * 親 ChecklistItem の {title, description, category} と project コンテキストを Haiku 4.5 に渡し、
 * Tool Use(`submit_subtasks`)で構造化されたサブタスク配列を受け取る。
 * 構造化中心の場面なので Haiku 4.5(ADR-005)。Category は親から継承するため AI には選ばせない。
 */
@Injectable()
export class TaskSplitService {
  constructor(private readonly anthropic: AnthropicService) {}

  async split(input: SplitTaskInput): Promise<SplitTaskResult> {
    const { project, parent, instructions, references } = input;

    const systemPrompt = [
      'あなたは個人開発者・小規模チームのプロダクトリリースを支援するアシスタントです。',
      '与えられた親タスクをより小さな実行可能なサブタスクに分解し、',
      `submit_subtasks ツールに渡してください。最大 ${TASK_SPLIT_MAX_ITEMS} 件まで。`,
      '各サブタスクの title は実行可能な短い動詞句(例: 「サインアップ画面のレイアウトを実装する」)。',
      'description は補足が必要な場合のみ書き、自明な項目は省略してください。',
      '実行順に並べてください(依存関係がある場合は先に来るものから)。',
      '親タスクと同じ抽象度のサブタスクは作らない(意味のある分解粒度に)。',
    ].join('');

    // RAG 参考(過去プロジェクトのドキュメント)。空(コールドスタート)なら何も注入しない。
    // TASK_SPLIT では「過去 README/LP に書かれた類似機能の実装ステップ」のヒントとして使う。
    // injection 対策の文言は format-reference.ts 側で自動付与される(SECURITY_GUIDANCE)。
    const referenceSection = formatReferenceSection(references, {
      usageHint:
        '以下は同じテナント内の過去ドキュメントです。類似機能の実装ステップやチェック観点のヒントとして使ってください。',
    });

    const userText = [
      '# プロジェクト情報',
      `- 名前: ${project.name}`,
      `- 概要: ${project.description?.trim() || '(未記入)'}`,
      `- 状態: ${project.status}`,
      '',
      '# 親タスク(これを分解する)',
      `- カテゴリ: ${parent.category}`,
      `- タイトル: ${parent.title}`,
      parent.description?.trim() ? `- 説明:\n${parent.description.trim()}` : '',
      instructions ? `\n# 追加指示\n${instructions}` : '',
      referenceSection,
    ]
      .filter(Boolean)
      .join('\n');

    // 【Anthropic API 呼び出し】Haiku 4.5 にメッセージを送り、Tool Use で構造化出力を受け取る。
    const res = await this.anthropic.client.messages.create({
      model: AI_MODEL_HAIKU,
      max_tokens: TASK_SPLIT_MAX_TOKENS,
      system: systemPrompt,
      tools: [SUBMIT_SUBTASKS_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_SUBTASKS_TOOL.name },
      messages: [{ role: 'user', content: userText }],
    });

    const block = res.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      throw new Error('Claude did not return the expected tool_use block');
    }

    const items = TaskSplitService.parseAndValidate(block.input);
    if (items.length === 0) {
      throw new Error('Claude returned no subtasks');
    }

    return {
      items,
      model: AI_MODEL_HAIKU,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
    };
  }

  /**
   * Tool Use で返ってきた未検証の `input` を、安全な配列にする。
   * Tool 側の JSON スキーマで形は強制しているが、モデル出力が完全に従う保証は無いので二重防御で TS 側でも検証する。
   * 空 title の項目は捨てる(全部捨てた場合は呼び出し側で 502 相当のエラー)。
   */
  private static parseAndValidate(input: unknown): GeneratedSubtask[] {
    const obj = (input ?? {}) as { items?: unknown };
    if (!Array.isArray(obj.items)) return [];
    const result: GeneratedSubtask[] = [];
    for (const raw of obj.items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as { title?: unknown; description?: unknown };
      if (typeof item.title !== 'string' || !item.title.trim()) continue;
      const description =
        typeof item.description === 'string' && item.description.trim()
          ? item.description.trim()
          : undefined;
      result.push({
        title: item.title.trim(),
        ...(description !== undefined ? { description } : {}),
      });
      if (result.length >= TASK_SPLIT_MAX_ITEMS) break;
    }
    return result;
  }
}
