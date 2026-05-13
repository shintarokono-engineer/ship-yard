import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { ProjectStatus } from '@shipyard/db';

/** `POST /workspaces/:slug/projects` のリクエストボディ。 */
export class CreateProjectDto {
  /** プロジェクト名(必須、1〜100 文字)。 */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  /** 概要(任意、Markdown 可)。 */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string;

  /** ライフサイクル状態(任意、未指定なら schema デフォルトの IDEA)。 */
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  /** リリース予定日 or 実績日(任意、ISO 8601 文字列)。 */
  @IsOptional()
  @IsISO8601()
  launchDate?: string;
}
