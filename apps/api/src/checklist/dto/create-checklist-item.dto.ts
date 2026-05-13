import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

import { Category, ItemStatus } from '@shipyard/db';

/** `POST /workspaces/:slug/projects/:projectId/checklist` のリクエストボディ。 */
export class CreateChecklistItemDto {
  /** 項目カテゴリ(必須、TECH / LEGAL / MARKETING / UX / OTHER)。 */
  @IsEnum(Category)
  category!: Category;

  /** 項目タイトル(必須、1〜200 文字)。 */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  /** 詳細説明(任意、Markdown 可)。 */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string;

  /** 進捗状態(任意、未指定なら schema デフォルトの TODO)。 */
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;

  /** 並び順(任意、未指定なら 0)。同一プロジェクト内で昇順表示。 */
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
