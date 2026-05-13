import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { ProjectStatus } from '@shipyard/db';

/**
 * `PATCH /workspaces/:slug/projects/:projectId` のリクエストボディ(全フィールド任意の部分更新)。
 * 送られたフィールドのみ更新する(`description` / `launchDate` を null に戻す操作は MVP では未対応)。
 */
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsISO8601()
  launchDate?: string;
}
