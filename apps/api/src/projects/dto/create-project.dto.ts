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

  // ----- 自由補足 4 フィールド(Day 44、ADR-013 改訂版「2 モード化」) -----
  // FE プレースホルダーで B2C / B2B 両対応の入力例を提示してユーザーを誘導する設計。

  /** 想定ユーザー(自由補足)。 */
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  targetUsers?: string;

  /** 解きたい課題(自由補足、アイデア検証の中核)。 */
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  problemStatement?: string;

  /** 想定機能リスト(自由補足、Markdown 可)。 */
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  proposedFeatures?: string;

  /** 想定価格モデル(自由補足、`pricingTier` で表現しきれない補足)。 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pricingModel?: string;

  // ----- 構造化セレクト 2 フィールド(Day 46.5 案 A、ADR-013 改訂版「構造化入力 v2」) -----
  // B2B 前提語彙を排し、全プロダクト適用可能なドメイン分類 + 課金/価格帯統合の 2 軸のみ。

  /** プロダクトのドメイン分類(セレクト 1 値)。 */
  @IsOptional()
  @IsIn(CATEGORY_DOMAINS)
  categoryDomain?: CategoryDomain;

  /** 課金モデル + 月額レンジを統合した 1 軸(セレクト 1 値)。 */
  @IsOptional()
  @IsIn(PRICING_TIERS)
  pricingTier?: PricingTier;
}
