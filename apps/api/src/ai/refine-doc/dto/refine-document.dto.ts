import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `POST /workspaces/:slug/projects/:projectId/documents/:documentId/refine` のリクエストボディ。
 *
 * 推敲対象ドキュメントは URL の `:documentId` で指定する(body には含めない)。
 * `goal` は任意で、未指定なら「全般的な明瞭さ・簡潔さの改善」が暗黙のデフォルト。
 */
export class RefineDocumentDto {
  /**
   * 推敲の方針。例: "より簡潔に" / "技術者向けに" / "親しみやすいトーンに" / "英語にローカライズ"。
   * 1000 文字を超える長文の指示は他のエンドポイント(将来追加)で扱う想定。
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  goal?: string;
}
