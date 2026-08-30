import type Anthropic from '@anthropic-ai/sdk';

import { SESSION_SUMMARY_MAX_CHARS } from '../shared/ai.constants';

export const SUBMIT_PROJECT_DESCRIPTION_TOOL: Anthropic.Messages.Tool = {
  name: 'submit_project_description',
  description: '壁打ちの記録から作成したプロジェクト概要を提出する。',
  input_schema: {
    type: 'object',
    required: ['description'],
    properties: {
      description: {
        type: 'string',
        description: `プロジェクトの概要文(日本語の Markdown、${SESSION_SUMMARY_MAX_CHARS} 字以内)。「# 概要」のような見出しは付けず本文から書く。`,
        maxLength: SESSION_SUMMARY_MAX_CHARS,
      },
    },
  },
};

export interface ParsedProjectDescription {
  description: string;
  truncated: boolean;
}

/**
 * Tool 入力から概要文を取り出す。空 / 型不一致は `null`(呼び出し側で 502)。
 *
 * スキーマの `maxLength` はモデルへのヒントなので、実効的な上限はここで担保する。
 * 切り詰めても「…」は付けない(この値は `Project.description` として保存されうる)。
 */
export function parseProjectDescription(
  input: unknown,
  maxChars: number,
): ParsedProjectDescription | null {
  const obj = (input ?? {}) as { description?: unknown };
  if (typeof obj.description !== 'string') return null;
  const trimmed = obj.description.trim();
  if (!trimmed) return null;
  return trimmed.length <= maxChars
    ? { description: trimmed, truncated: false }
    : { description: trimmed.slice(0, maxChars), truncated: true };
}
