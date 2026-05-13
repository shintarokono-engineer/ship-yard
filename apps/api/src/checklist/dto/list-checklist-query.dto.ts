import { IsEnum, IsOptional } from 'class-validator';

import { Category } from '@shipyard/db';

/** `GET /workspaces/:slug/projects/:projectId/checklist` のクエリパラメータ。 */
export class ListChecklistQueryDto {
  /** カテゴリでフィルタ(任意)。 */
  @IsOptional()
  @IsEnum(Category)
  category?: Category;
}
