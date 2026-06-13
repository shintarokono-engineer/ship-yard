import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { BlogPostService } from './blog-post.service';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

/**
 * BlogPost 管理 API(ADR-014 §3)。
 *
 * 認証 → 所属解決 → 書き込み権限チェックは `ClerkAuthGuard` → `WorkspaceGuard`(`@Roles(...WRITER_ROLES)`)が担う。
 * 閲覧系(list / get)はガード経由の所属確認のみで、ロール制限を付けず全テナントメンバーが参照可。
 */
@Controller('workspaces/:slug/projects/:projectId/blog-posts')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class BlogPostController {
  constructor(private readonly service: BlogPostService) {}

  /** GET 一覧(下書きを含む、UI ではフィルタリング)。 */
  @Get()
  async list(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
  ) {
    const posts = await this.service.listByProject(ws.tenantId, projectId);
    return { posts };
  }

  /** GET 単件(プレビュー / 編集画面の初期表示用)。 */
  @Get(':id')
  async get(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.getById(ws.tenantId, projectId, id);
  }

  /** PATCH 編集(タイトル / 本文 / slug / 公開状態)。 */
  @Patch(':id')
  @Roles(...WRITER_ROLES)
  async update(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBlogPostDto,
  ) {
    return this.service.update(ws.tenantId, projectId, id, dto);
  }
}
