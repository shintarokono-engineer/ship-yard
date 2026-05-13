import { IsEnum, IsOptional } from 'class-validator';

import { ProjectStatus } from '@shipyard/db';

/** `GET /workspaces/:slug/projects` のクエリパラメータ。 */
export class ListProjectsQueryDto {
  /** ライフサイクル状態でフィルタ(任意)。 */
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
