import { IsEnum, IsOptional } from 'class-validator';

import { DocType } from '@shipyard/db';

/** `GET /workspaces/:slug/projects/:projectId/documents` のクエリパラメータ。 */
export class ListDocumentsQueryDto {
  /** 文書タイプでフィルタ(任意)。 */
  @IsOptional()
  @IsEnum(DocType)
  type?: DocType;
}
