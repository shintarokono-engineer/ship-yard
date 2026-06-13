import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import {
  BLOG_BODY_MAX,
  BLOG_BODY_MIN,
  BLOG_SLUG_MAX,
  BLOG_TITLE_MAX,
} from '../../announcements/announcement.constants';

/**
 * BlogPost 編集 DTO(ADR-014)。タイトル / 本文 / slug / 公開状態を個別に編集可能。
 *
 * - `title` は省略可、指定時は 1〜`BLOG_TITLE_MAX` 字
 * - `body` は省略可、指定時は `BLOG_BODY_MIN` 字以上(空投稿防止)
 * - `slug` は kebab-case のみ許容、`BLOG_SLUG_MAX` 字以内
 * - `published`: true → `publishedAt = now`、false → `publishedAt = null`(下書きへ戻す)
 */
export class UpdateBlogPostDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(BLOG_TITLE_MAX)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(BLOG_BODY_MIN)
  @MaxLength(BLOG_BODY_MAX)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(BLOG_SLUG_MAX)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug は半角小文字 + 数字 + ハイフンのみ使用可',
  })
  slug?: string;

  /** true = 公開(publishedAt = now)、false = 下書きに戻す(publishedAt = null)。 */
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
