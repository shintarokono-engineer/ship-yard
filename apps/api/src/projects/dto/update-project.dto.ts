import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { ProjectStatus } from '@shipyard/db';

import {
  CATEGORY_DOMAINS,
  PRICING_TIERS,
  type CategoryDomain,
  type PricingTier,
} from '../project-brief.constants';

/**
 * `PATCH /workspaces/:slug/projects/:projectId` のリクエストボディ(全フィールド任意の部分更新)。
 *
 * セマンティクス:
 * - 未指定(キーがない / `undefined`) … 既存値を保持する
 * - `null` を明示送信 … その列を `null` にクリアする(nullable 列のみ可)
 * - 文字列を送信 … その値で置き換える
 *
 * `@IsOptional()` は `undefined` と `null` の両方を許容するため、`null` は後続の `@IsString()` /
 * `@IsISO8601()` をスキップして Prisma にそのまま渡り、nullable 列は null クリアとして適用される。
 * `name` / `status` は schema 上 NOT NULL なので null クリア不可。
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

  // ----- 自由補足 4 フィールド(Day 44) -----

  /** 想定ユーザー(自由補足)。`null` を送ると null クリア。 */
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  targetUsers?: string | null;

  /** 解きたい課題(自由補足)。`null` を送ると null クリア。 */
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  problemStatement?: string | null;

  /** 想定機能リスト(自由補足、Markdown 可)。`null` を送ると null クリア。 */
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  proposedFeatures?: string | null;

  /** 想定価格モデル(自由補足)。`null` を送ると null クリア。 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pricingModel?: string | null;

  // ----- 構造化セレクト 2 フィールド(Day 46.5 案 A) -----
  // 各フィールドは `null` 明示で列クリア可能(自由補足と同パターン)。

  /** プロダクトのドメイン分類。 */
  @IsOptional()
  @IsIn(CATEGORY_DOMAINS)
  categoryDomain?: CategoryDomain | null;

  /** 課金モデル + 月額レンジを統合した 1 軸。 */
  @IsOptional()
  @IsIn(PRICING_TIERS)
  pricingTier?: PricingTier | null;
}
