import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { AI_INSTRUCTIONS_MAX_LENGTH } from '../ai.constants';

import {
  SUGGESTION_MAX_COUNT,
  SUGGESTION_SOURCES,
  type SuggestionSource,
} from '../suggestion-source';

/**
 * `POST /workspaces/:slug/projects/:projectId/checklist/from-suggestions` のリクエストボディ(F17)。
 *
 * 提案の本文は受け取らない。`sourceId` と配列 index だけを受け、本文はサーバ側が DB から引き直す。
 * FE から任意文字列をプロンプトに載せられる経路を作らないため(`suggestion-source.ts` 参照)。
 */
export class CreateChecklistFromSuggestionsDto {
  /** 提案の取得元。診断とアイデア検証で `suggestions` の形は同型だが、評価軸の集合が違う。 */
  @IsIn(SUGGESTION_SOURCES)
  source!: SuggestionSource;

  /** `ServiceScore.id` または `IdeaValidation.id`(cuid)。テナント分離は `getById` が担う。 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sourceId!: string;

  /**
   * タスク化する提案の配列 index。
   * 上限は保存され得る提案の最大件数(診断・検証とも 5 件)から算出する。
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SUGGESTION_MAX_COUNT)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(SUGGESTION_MAX_COUNT - 1, { each: true })
  indexes!: number[];

  /** 分解方針への追加指示(任意)。 */
  @IsOptional()
  @IsString()
  @MaxLength(AI_INSTRUCTIONS_MAX_LENGTH)
  instructions?: string;
}
