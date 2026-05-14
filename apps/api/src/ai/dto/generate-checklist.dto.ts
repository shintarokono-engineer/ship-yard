import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { Category } from '@shipyard/db';

/** `POST /workspaces/:slug/projects/:projectId/checklist/generate` のリクエストボディ。 */
export class GenerateChecklistDto {
  /**
   * 生成への追加指示(任意)。例: 「セキュリティ系を厚めに」「個人開発スコープに絞る」等。
   * Project 情報(name / description / status)は呼び出し側で自動で渡るので、ここに改めて書かなくてよい。
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  /**
   * 生成カテゴリの絞り込み(任意、最低 1 件)。
   * - **未指定**(キーなし) … 全カテゴリ(TECH / LEGAL / MARKETING / UX / OTHER)を生成対象にする
   * - **1 件以上指定** … そのカテゴリのみ生成
   * - **空配列** … 400(`@ArrayMinSize(1)`)。「絞り込み無し」は空配列ではなく未指定で表現する
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(Category, { each: true })
  categories?: Category[];
}
