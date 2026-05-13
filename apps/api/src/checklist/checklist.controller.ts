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
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { ChecklistService } from './checklist.service';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { ListChecklistQueryDto } from './dto/list-checklist-query.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';

/**
 * プロジェクトのリリース前チェックリスト項目(ChecklistItem)の CRUD API。
 * - 参照(一覧 / 取得): テナントメンバーなら誰でも
 * - 作成 / 更新 / 削除: DEVELOPER 以上(`WRITER_ROLES` — 「チェックリストの編集」の一部とみなす)
 *
 * 認証 → 所属解決 → ロール検証は `ClerkAuthGuard` → `WorkspaceGuard`(+ `@Roles`)が担う。
 * 未所属 / slug・project・item 不在はすべて 404(存在の有無を漏らさない、ADR-003)。
 * AI による一括生成(CHECKLIST_GEN)は別エンドポイントを後続で追加予定。
 */
@Controller('workspaces/:slug/projects/:projectId/checklist')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class ChecklistController {
  constructor(private readonly checklist: ChecklistService) {}

  /** POST /workspaces/:slug/projects/:projectId/checklist — 項目作成。 */
  @Post()
  @Roles(...WRITER_ROLES)
  create(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Body() dto: CreateChecklistItemDto,
  ) {
    return this.checklist.create(ws.tenantId, projectId, dto);
  }

  /** GET /workspaces/:slug/projects/:projectId/checklist[?category=TECH|LEGAL|...] — 一覧(position 昇順)。 */
  @Get()
  list(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Query() query: ListChecklistQueryDto,
  ) {
    return this.checklist.list(ws.tenantId, projectId, query.category);
  }

  /** GET /workspaces/:slug/projects/:projectId/checklist/:itemId — 1 件。 */
  @Get(':itemId')
  get(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.checklist.getOwnedOrThrow(ws.tenantId, projectId, itemId);
  }

  /** PATCH /workspaces/:slug/projects/:projectId/checklist/:itemId — 部分更新(status / position 含む)。 */
  @Patch(':itemId')
  @Roles(...WRITER_ROLES)
  update(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.checklist.update(ws.tenantId, projectId, itemId, dto);
  }

  /** DELETE /workspaces/:slug/projects/:projectId/checklist/:itemId — 削除。204 を返す。 */
  @Delete(':itemId')
  @Roles(...WRITER_ROLES)
  @HttpCode(204)
  remove(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    return this.checklist.remove(ws.tenantId, projectId, itemId);
  }
}
