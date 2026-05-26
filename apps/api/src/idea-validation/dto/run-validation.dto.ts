import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `POST /workspaces/:slug/projects/:projectId/idea-validations` のリクエスト DTO
 * (ADR-013 改訂版「2 モード化」、Day 44)。
 *
 * アイデア検証は基本的に Project の詳細情報フィールド(targetUsers / problemStatement /
 * proposedFeatures / pricingModel)を読み込んで実行するため、クライアントから明示的に渡す
 * 情報は「追加の指示」 のみ(任意)。RunDiagnosisDto と同パターン。
 *
 * 重要:Project の詳細情報フィールドが空の場合は Service 側で 400 エラーを返す(検証不能)。
 */
export class RunValidationDto {
  /**
   * AI への追加指示(任意、Markdown 可、2000 文字以内)。
   *
   * 例:「BtoB 向けの観点で評価」「日本市場に絞って評価」 等。
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}
