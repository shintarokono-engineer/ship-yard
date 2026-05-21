import { IsBoolean } from 'class-validator';

/** `PATCH /workspaces/:slug/projects/:projectId/landing-page/publish` のリクエストボディ。 */
export class PublishLandingPageDto {
  /** true で公開(`publishedAt` に現在時刻)、false で非公開(`publishedAt` を null に)。 */
  @IsBoolean()
  published!: boolean;
}
