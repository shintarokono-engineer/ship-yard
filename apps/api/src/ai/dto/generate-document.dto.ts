import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { DocType } from '@shipyard/db';

import type { DocKind } from '../draft-gen.service';

/** `POST /workspaces/:slug/projects/:projectId/documents/generate` のリクエストボディ。 */
export class GenerateDocumentDto {
  /** 生成する文書の種別。現状 README / LANDING_PAGE のみ対応(`@IsEnum` だと全 DocType を許すので `@IsIn` で絞る)。 */
  @IsIn([DocType.README, DocType.LANDING_PAGE])
  docType!: DocKind;

  /** 生成への追加指示(任意)。 */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}
