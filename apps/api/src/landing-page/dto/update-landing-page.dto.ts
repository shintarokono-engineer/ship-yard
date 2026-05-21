import { IsArray } from 'class-validator';

/** `PUT /workspaces/:slug/projects/:projectId/landing-page` のリクエストボディ。 */
export class UpdateLandingPageDto {
  /**
   * 編集後の LP ブロック配列。判別ユニオンの厳密な検証は class-validator では表現しにくいため、
   * 配列であることだけ検証し、要素の構造検証は controller の `parseLpBlocks` に委ねる
   * (生成 API が AI 出力を `parseLpBlocks` で正規化するのと同じ 3 段防御の方針)。
   */
  @IsArray()
  blocks!: unknown[];
}
