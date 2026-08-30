import { IsOptional, IsString, MaxLength } from 'class-validator';

import { AI_INSTRUCTIONS_MAX_LENGTH } from '../../_shared/ai.constants';

/** `POST /workspaces/:slug/projects/:projectId/checklist/:itemId/split` のリクエストボディ。 */
export class SplitTaskDto {
  /**
   * 分解への追加指示(任意)。例: 「テスト視点も含めて」「実装ステップに分けて」「より細かい粒度で」等。
   * 親タスク(title / description / category)とプロジェクト情報は呼び出し側で自動で渡るので、ここに改めて書かなくてよい。
   */
  @IsOptional()
  @IsString()
  @MaxLength(AI_INSTRUCTIONS_MAX_LENGTH)
  instructions?: string;
}
