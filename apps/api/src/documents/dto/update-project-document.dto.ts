import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { AtLeastOneFieldDefined } from '../../common/validators/at-least-one-field-defined';

/**
 * `PATCH /workspaces/:slug/projects/:projectId/documents/:documentId` のリクエストボディ。
 *
 * セマンティクス(append-only):
 * - この PATCH は既存行を **UPDATE しない**。代わりに、対象ドキュメントと同じ `(projectId, type)` の中で
 *   `MAX(version) + 1` の **新しい行を INSERT** する(`createdById` は呼び出しユーザーになる)。
 * - 送られなかったフィールドは元のドキュメントから引き継ぐ(title だけ変えて content は同じ、なども可)。
 * - 両方欠落の場合はバリデーションエラー(`AtLeastOneFieldDefined` で 400)。意味のある編集ではないため。
 *
 * AI を介さない手動編集を想定。AI 推敲は別エンドポイント(`POST .../documents/:id/refine`、後続実装)に切り出す。
 */
export class UpdateProjectDocumentDto {
  /** 新しいタイトル(任意)。未指定なら元ドキュメントの title を引き継ぐ。 */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  /** 新しい本文(任意、Markdown)。未指定なら元ドキュメントの content を引き継ぐ。 */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  content?: string;

  /**
   * クロスフィールド検証「title または content のいずれかが必須」の宿主となるダミープロパティ。
   * リクエスト body には現れず、値も参照されない(`AtLeastOneFieldDefined` は `args.object` 全体を見る)。
   * `@IsOptional` を付けないと、値が undefined でも validator が必ず実行される
   * (`@IsOptional` が同じプロパティに乗ると、null/undefined 時に他バリデータが全部スキップされる仕様のため、
   * 既存フィールド側に乗せると望み通り動かない。だからダミー専用フィールドが必要)。
   */
  @AtLeastOneFieldDefined(['title', 'content'])
  // @ts-expect-error - class-validator デコレータの宿主用に宣言した読まれないフィールド(TS6133 を意図的に抑止)
  private readonly _atLeastOne!: never;
}
