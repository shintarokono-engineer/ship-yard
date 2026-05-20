import { IsOptional, IsString, MaxLength } from 'class-validator';

/** `POST /workspaces/:slug/projects/:projectId/landing-page/generate` のリクエストボディ。 */
export class GenerateLandingPageDto {
  /** LP 生成への追加指示(任意)。 */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}
