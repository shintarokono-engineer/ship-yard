import { IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * `POST /workspaces` のリクエストボディ。
 *
 * - `name` は人間向け表示名(3〜50 文字)
 * - `slug` は省略時に Service 側で `name` から自動生成(衝突時はサフィックスで一意化)。
 *   ユーザーが指定する場合は URL に出る識別子なので `[a-z0-9-]` のみ + 3〜30 文字
 */
export class CreateWorkspaceDto {
  /** ワークスペース表示名(必須、3〜50 文字)。 */
  @IsString()
  @Length(3, 50)
  name!: string;

  /**
   * URL 用 slug(任意)。省略時は Service が `name` から自動生成。
   * 指定する場合は `Tenant.slug` の制約(英数字+ハイフン、3〜30 文字)に従う。
   */
  @IsOptional()
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with single hyphens',
  })
  slug?: string;
}
