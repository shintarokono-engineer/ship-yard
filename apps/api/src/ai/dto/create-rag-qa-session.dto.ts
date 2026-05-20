import { IsString, MaxLength, MinLength } from 'class-validator';

/** `POST /workspaces/:slug/projects/:projectId/qa/sessions` のリクエストボディ。 */
export class CreateRagQaSessionDto {
  /** セッションタイトル(ユーザーが付ける名前。v1.x で初回質問から自動生成予定)。 */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;
}
