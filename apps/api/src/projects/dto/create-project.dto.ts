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

  /** 想定ユーザー(ADR-013 改訂版「2 モード化」、アイデア検証 + プロダクト診断で参照)。 */
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  targetUsers?: string;

  /** 解きたい課題(ADR-013 改訂版、アイデア検証で必須相当)。 */
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  problemStatement?: string;

  /** 想定機能リスト(Markdown 可、ADR-013 改訂版)。 */
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  proposedFeatures?: string;

  /** 想定価格モデル(例「Free + Pro ¥980/月」、ADR-013 改訂版)。 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pricingModel?: string;
}
