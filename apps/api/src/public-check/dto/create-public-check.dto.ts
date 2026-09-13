import { IsString, MaxLength, MinLength } from 'class-validator';

import {
  PUBLIC_CHECK_INPUT_MAX_CHARS,
  PUBLIC_CHECK_INPUT_MIN_CHARS,
} from '../public-check.constants';

/** `POST /public/idea-checks` のリクエストボディ。入力はアイデア文 1 つだけ。 */
export class CreatePublicCheckDto {
  @IsString()
  @MinLength(PUBLIC_CHECK_INPUT_MIN_CHARS)
  @MaxLength(PUBLIC_CHECK_INPUT_MAX_CHARS)
  ideaText!: string;
}
