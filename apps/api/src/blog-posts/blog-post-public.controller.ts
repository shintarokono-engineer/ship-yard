import { Controller, Get, Param } from '@nestjs/common';

import { BlogPostService } from './blog-post.service';

/**
 * 公開ブログ API(ADR-014 §3)。
 *
 * `/public/blog-posts/:slug/:projectId/:postSlug` で未認証アクセス可。
 * 公開済(`publishedAt` セット)のみ返却。内部フィールドは Service 側の `select` で除外。
 * テナント所属チェックは行わない(公開ページのため誰でも閲覧可)。
 * guard を付けない別 controller に分離する方針は `PublicLandingPageController` と同じ。
 */
@Controller('public/blog-posts')
export class BlogPostPublicController {
  constructor(private readonly service: BlogPostService) {}

  /**
   * GET /public/blog-posts/:slug/:projectId/:postSlug(未認証可)
   * - 公開済みブログが無ければ 404(未公開 / 未生成 / slug・project 不在を区別しない)
   */
  @Get(':slug/:projectId/:postSlug')
  async getPublic(
    @Param('slug') slug: string,
    @Param('projectId') projectId: string,
    @Param('postSlug') postSlug: string,
  ) {
    return this.service.findPublic(slug, projectId, postSlug);
  }
}
