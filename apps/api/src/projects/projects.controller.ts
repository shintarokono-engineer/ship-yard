import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { ADMIN_ROLES, Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

/**
 * プロジェクトの CRUD API。
 * - 参照(一覧 / 取得): テナントメンバーなら誰でも
 * - 作成 / 更新: DEVELOPER 以上(`WRITER_ROLES`)
 * - 削除: ADMIN 以上(`ADMIN_ROLES`)。子リソース(チェックリスト / ドキュメント)が連鎖削除されるため
 *
 * 認証 → 所属解決 → ロール検証は `ClerkAuthGuard` → `WorkspaceGuard`(+ `@Roles`)が担う。
 * 未所属 / slug・project 不在はすべて 404(存在の有無を漏らさない、ADR-003)。
 */
@Controller('workspaces/:slug/projects')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /** POST /workspaces/:slug/projects — プロジェクト作成。 */
  @Post()
  @Roles(...WRITER_ROLES)
  create(@CurrentWorkspace() ws: WorkspaceAccess, @Body() dto: CreateProjectDto) {
    return this.projects.create(ws.tenantId, ws.userId, dto);
  }

  /** GET /workspaces/:slug/projects[?status=IDEA|IN_DEV|...] — プロジェクト一覧(子要素件数付き)。 */
  @Get()
  list(@CurrentWorkspace() ws: WorkspaceAccess, @Query() query: ListProjectsQueryDto) {
    return this.projects.list(ws.tenantId, query.status);
  }

  /** GET /workspaces/:slug/projects/:projectId — プロジェクト 1 件。 */
  @Get(':projectId')
  get(@CurrentWorkspace() ws: WorkspaceAccess, @Param('projectId') projectId: string) {
    return this.projects.getOwnedOrThrow(ws.tenantId, projectId);
  }

  /** PATCH /workspaces/:slug/projects/:projectId — 部分更新。 */
  @Patch(':projectId')
  @Roles(...WRITER_ROLES)
  update(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(ws.tenantId, projectId, dto);
  }

  /** DELETE /workspaces/:slug/projects/:projectId — 削除。204 を返す。 */
  @Delete(':projectId')
  @Roles(...ADMIN_ROLES)
  @HttpCode(204)
  remove(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
  ): Promise<void> {
    return this.projects.remove(ws.tenantId, projectId);
  }
}
