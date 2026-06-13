import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { ANNOUNCEMENT_CHANNELS } from '../announcement-types';
import { ANNOUNCEMENT_TOPIC_MAX } from '../announcement.constants';

/**
 * Announcement の AI 文面生成 DTO(ADR-014 §2)。
 *
 * - `topic`:ユーザーが今回伝えたい告知の自由入力(主入力)
 * - `channels`:部分再生成したいチャネル(省略時は全 channel)。Tool Use API call は 1 回固定で
 *   全 channel 出力 → 不要分は Service 側で破棄する設計のため、ここでは「どの Delivery を上書きするか」だけを制御する。
 */
export class GenerateAnnouncementDto {
  /** ユーザーが伝えたい告知トピック(自由入力)。 */
  @IsString()
  @MinLength(1)
  @MaxLength(ANNOUNCEMENT_TOPIC_MAX)
  topic!: string;

  /** 部分再生成。未指定なら全 channel。 */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ANNOUNCEMENT_CHANNELS as readonly string[], { each: true })
  channels?: Array<'TWITTER' | 'BLOG'>;
}
