import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { type DocKind, GENERATABLE_DOC_TYPES } from '../ai.constants';

/** `POST /workspaces/:slug/projects/:projectId/documents/generate` のリクエストボディ。 */
export class GenerateDocumentDto {
  /** 生成する文書の種別。AI 生成に対応する種別のみ(`@IsEnum` だと全 DocType を許すので `@IsIn(GENERATABLE_DOC_TYPES)` で絞る)。 */
  @IsIn(GENERATABLE_DOC_TYPES)
  docType!: DocKind;

  /** 生成への追加指示(任意)。 */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}
