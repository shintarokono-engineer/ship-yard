import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { ANNOUNCEMENT_TITLE_MAX, TWITTER_TEXT_MAX } from '../announcement.constants';

/**
 * Twitter Delivery の content 編集用 nested DTO(ADR-014)。
 * 280 字超過は class-validator で reject。`@ValidateNested` + `@Type` の併用が必須(後者なしでは
 * `class-transformer` が plain object のまま渡し、内部のデコレータが評価されない)。
 */
class TwitterContentInput {
  @IsString()
  @MinLength(1)
  @MaxLength(TWITTER_TEXT_MAX)
  text!: string;
}

/**
 * Announcement 更新 DTO(ADR-014)。
 *
 * - `title`(内部管理用、配信文面には影響しない)
 * - `twitterContent`(Twitter Delivery の content を直接編集 — 再生成せずユーザーの手で文面を直したい場合の入口)
 *
 * Blog Delivery の本文編集は `PATCH /workspaces/.../blog-posts/:id` 経由のため本 DTO では受けない。
 */
export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ANNOUNCEMENT_TITLE_MAX)
  title?: string;

  /** Twitter Delivery の content 直接編集(280 字超過は class-validator で reject)。 */
  @IsOptional()
  @ValidateNested()
  @Type(() => TwitterContentInput)
  twitterContent?: TwitterContentInput;
}
