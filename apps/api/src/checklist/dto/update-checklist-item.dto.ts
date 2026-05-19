import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

import { Category, ItemStatus } from '@shipyard/db';

/**
 * `PATCH /workspaces/:slug/projects/:projectId/checklist/:itemId` のリクエストボディ(全フィールド任意の部分更新)。
 *
 * セマンティクス:
 * - 未指定(キーがない / `undefined`) … 既存値を保持する
 * - `null` を明示送信 … その列を `null` にクリアする(`description` のみ可)
 * - 値を送信 … その値で置き換える
 *
 * `@IsOptional()` は `undefined` と `null` の両方を許容するため、`null` は後続のバリデータをスキップして
 * Prisma にそのまま渡り、nullable な `description` は null クリアとして適用される。
 * `category` / `title` / `status` / `position` は schema 上 NOT NULL なので null クリア不可。
 *
 * `parentId` は **update では受け取らない**(create と TASK_SPLIT でのみ設定可、ADR-005)。
 * UI からの親変更経路は無く、サブタスク化したい場合は新規 create で `parentId` を指定する。
 */
export class UpdateChecklistItemDto {
  @IsOptional()
  @IsEnum(Category)
  category?: Category;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  /** 詳細説明(任意)。`null` を送ると null にクリアできる。 */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
