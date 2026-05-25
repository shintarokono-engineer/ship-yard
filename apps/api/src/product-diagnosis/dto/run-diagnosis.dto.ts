import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `POST /workspaces/:slug/projects/:projectId/diagnoses` のリクエスト DTO(ADR-013、Day 43)。
 *
 * 診断は基本的にプロジェクト内のデータ(README / LP / ChecklistItem)を全て読み込んで実行するため、
 * クライアントから明示的に渡す情報は「追加の指示」 のみ(任意)。LP の `GenerateLandingPageDto` と
 * 同パターン。
 */
export class RunDiagnosisDto {
  /**
   * AI への追加指示(任意、Markdown 可、2000 文字以内)。
   *
   * 例:「ターゲットを個人開発者に絞って評価してほしい」「アクセシビリティの観点を重視」 等。
   * 未指定なら rubric 通りの汎用評価。
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}
