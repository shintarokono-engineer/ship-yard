import { Module } from '@nestjs/common';

import { MembershipService } from '../workspaces/membership.service';
import { BlogPostController } from './blog-post.controller';
import { BlogPostPublicController } from './blog-post-public.controller';
import { BlogPostService } from './blog-post.service';

/**
 * BlogPost モジュール(ADR-014 §3)。
 *
 * - 管理 API(`BlogPostController`)と公開 API(`BlogPostPublicController`)を 1 モジュールに集約。
 * - `BlogPostService` は `AnnouncementService`(Task 12)からも利用するため `exports`。
 * - `MembershipService` は `WorkspaceGuard` が DI 要求するため provider に含める
 *   (`IntegrationsTwitterModule` と同じパターン)。
 */
@Module({
  controllers: [BlogPostController, BlogPostPublicController],
  providers: [BlogPostService, MembershipService],
  exports: [BlogPostService],
})
export class BlogPostModule {}
