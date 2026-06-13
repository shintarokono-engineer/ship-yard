import { Controller, Get, NotFoundException, Param } from '@nestjs/common';

import { LandingPageService } from './landing-page.service';

/**
 * 未認証で叩ける公開 LP API。公開 URL `/p/{slug}/{projectId}` のページが参照する。
 *
 * `publishedAt` がセットされた LP のみ返す。テナント所属チェックは行わない(公開ページのため誰でも閲覧可)。
 * 未公開 / 未生成 / slug・project 不在はすべて 404 で弁別しない(公開していない LP の存在を漏らさない)。
 * guard を付けない別 controller に分離する方針は `PublicInvitationsController` と同じ。
 */
@Controller('public/landing-pages')
export class PublicLandingPageController {
  constructor(private readonly landingPage: LandingPageService) {}

  /**
   * GET /public/landing-pages(未認証可)
   * - 公開済み LP を全テナント横断で列挙する(sitemap 生成用、F10)。
   * - sitemap に載せる最小情報(slug / projectId / 公開日時)のみ返す。
   */
  @Get()
  async list() {
    const items = await this.landingPage.listPublished();
    return items.map((lp) => ({
      slug: lp.tenant.slug,
      projectId: lp.projectId,
      publishedAt: lp.publishedAt,
    }));
  }

  /**
   * GET /public/landing-pages/:slug/:projectId(未認証可)
   * - 公開済み LP が無ければ 404
   */
  @Get(':slug/:projectId')
  async get(@Param('slug') slug: string, @Param('projectId') projectId: string) {
    const lp = await this.landingPage.findPublished(slug, projectId);
    if (!lp) {
      throw new NotFoundException('ランディングページが見つかりません。');
    }
    return {
      blocks: lp.blocks,
      projectName: lp.project.name,
      theme: lp.theme,
      publishedAt: lp.publishedAt,
    };
  }
}
