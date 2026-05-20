import { IsString, MaxLength, MinLength } from 'class-validator';

import { RAG_QA_MAX_MESSAGE_LENGTH } from '../ai.constants';

/** `POST /workspaces/:slug/projects/:projectId/qa/sessions/:sessionId/messages` のリクエストボディ。 */
export class AskRagQaDto {
  /** ユーザーからの質問本文(Markdown 可、`RAG_QA_MAX_MESSAGE_LENGTH` 文字以内、ADR-005 Day 27 改訂)。 */
  @IsString()
  @MinLength(1)
  @MaxLength(RAG_QA_MAX_MESSAGE_LENGTH)
  question!: string;
}
