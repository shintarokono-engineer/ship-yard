import { IsOptional, IsString, MaxLength } from 'class-validator';

import { AI_INSTRUCTIONS_MAX_LENGTH } from '../ai.constants';

/**
 * `POST /workspaces/:slug/projects/:projectId/qa/sessions/:sessionId/summary` のボディ。
 * 発言本文は受け取らず、要約対象はサーバ側が `sessionId` から引き直す。
 */
export class SummarizeSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(AI_INSTRUCTIONS_MAX_LENGTH)
  instructions?: string;
}
