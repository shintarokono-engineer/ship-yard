import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { ProjectStatus } from '@shipyard/db';

/**
 * `PATCH /workspaces/:slug/projects/:projectId` のリクエストボディ(全フィールド任意の部分更新)。
 *
 * セマンティクス:
 * - 未指定(キーがない / `undefined`) … 既存値を保持する
 * - `null` を明示送信 … その列を `null` にクリアする(`description` / `launchDate` のみ可)
 * - 文字列を送信 … その値で置き換える
 *
 * `@IsOptional()` は `undefined` と `null` の両方を許容するため、`null` は後続の `@IsString()` /
 * `@IsISO8601()` をスキップして Prisma にそのまま渡り、列が nullable な `description` / `launchDate`
 * は null クリアとして適用される。`name` / `status` は schema 上 NOT NULL なので null クリア不可。
 */
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  /** 詳細説明(任意)。`null` を送ると null にクリアできる。 */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  /** リリース予定日(ISO 8601、任意)。`null` を送ると null にクリアできる。 */
  @IsOptional()
  @IsISO8601()
  launchDate?: string | null;
}
