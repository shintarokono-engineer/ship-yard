import { IsString, MaxLength, MinLength } from 'class-validator';

import { ANNOUNCEMENT_TITLE_MAX } from '../announcement.constants';

/**
 * Announcement 新規作成 DTO(ADR-014)。
 * MVP では内部管理用 `title` のみを受け取り、status は `DRAFT` 固定で開始する。
 * 配信文面は別途 `POST :id/generate` で AI 生成、`Delivery` は upsert される。
 */
export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(ANNOUNCEMENT_TITLE_MAX)
  title!: string;
}
