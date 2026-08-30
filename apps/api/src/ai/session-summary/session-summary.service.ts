import { Injectable } from '@nestjs/common';

import {
  AI_MODEL_SONNET,
  SESSION_SUMMARY_MAX_CHARS,
  SESSION_SUMMARY_MAX_TOKENS,
} from '../_shared/ai.constants';
import { AIBadResponseError } from '../_shared/ai-error';
import { AnthropicService } from '../_shared/anthropic.service';
import {
  parseProjectDescription,
  SUBMIT_PROJECT_DESCRIPTION_TOOL,
} from './project-description-tool';
import {
  buildSessionSummaryPrompt,
  type SessionSummaryPromptInput,
} from './session-summary.prompt';
import { extractToolUseBlock } from '../_shared/tool-use';

/**
 * 壁打ちセッションを要約して `Project.description` の候補文を作る。
 *
 * Tool Use を使うのは、自由文だと前置きが概要欄に混入するため。
 * RAG 参考は渡さない(対話に無い内容が概要に紛れ込む)。
 * 生成結果は保存しない。保存は `PATCH /workspaces/:slug/projects/:projectId` が担う。
 */

export type GenerateSessionSummaryInput = SessionSummaryPromptInput;

export interface GeneratedSessionSummary {
  description: string;
  /** `SESSION_SUMMARY_MAX_CHARS` で切り詰めたか。 */
  truncated: boolean;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

@Injectable()
export class SessionSummaryService {
  constructor(private readonly anthropic: AnthropicService) {}

  async generate(input: GenerateSessionSummaryInput): Promise<GeneratedSessionSummary> {
    const { system, user } = buildSessionSummaryPrompt(input);

    const res = await this.anthropic.client.messages.create({
      model: AI_MODEL_SONNET,
      max_tokens: SESSION_SUMMARY_MAX_TOKENS,
      system,
      tools: [SUBMIT_PROJECT_DESCRIPTION_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_PROJECT_DESCRIPTION_TOOL.name },
      messages: [{ role: 'user', content: user }],
    });

    const block = extractToolUseBlock(res, 'SESSION_SUMMARY');
    const parsed = parseProjectDescription(block.input, SESSION_SUMMARY_MAX_CHARS);
    if (!parsed) {
      throw new AIBadResponseError('Claude returned no project description (SESSION_SUMMARY)');
    }

    return {
      description: parsed.description,
      truncated: parsed.truncated,
      model: AI_MODEL_SONNET,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
    };
  }
}
