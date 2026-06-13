import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { AnnouncementService } from './announcement.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { GenerateAnnouncementDto } from './dto/generate-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

/**
 * Announcement 管理 API(ADR-014 §2 / §3)。
 *
 * 認証 → 所属解決 → 書き込み権限チェックは `ClerkAuthGuard` → `WorkspaceGuard`(`@Roles(...WRITER_ROLES)`)が担う。
 * 閲覧系(list / get)はガード経由の所属確認のみで、ロール制限を付けず全テナントメンバーが参照可。
 *
 * 認可マトリクス:
 * - POST / PATCH / DELETE / generate / execute → WRITER_ROLES(OWNER / ADMIN / DEVELOPER)
 * - GET / GET :id → 所属メンバー全員
 */
@Controller('workspaces/:slug/projects/:projectId/announcements')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class AnnouncementController {
  constructor(private readonly service: AnnouncementService) {}

  /** POST /workspaces/:slug/projects/:projectId/announcements:新規 Announcement(status=DRAFT)を作成。 */
  @Post()
  @Roles(...WRITER_ROLES)
  async create(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.service.create(ws.tenantId, projectId, ws.userId, dto);
  }

  /** GET /workspaces/:slug/projects/:projectId/announcements:一覧(Delivery の channel + status を含む)。 */
  @Get()
  async list(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
  ) {
    return this.service.list(ws.tenantId, projectId);
  }

  /** GET /workspaces/:slug/projects/:projectId/announcements/:id:詳細(Delivery 全件含む)。 */
  @Get(':id')
  async get(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.getDetail(ws.tenantId, projectId, id);
  }

  /** PATCH /workspaces/:slug/projects/:projectId/announcements/:id:タイトル / Twitter content 更新。 */
  @Patch(':id')
  @Roles(...WRITER_ROLES)
  async update(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.service.update(ws.tenantId, projectId, id, dto);
  }

  /** DELETE /workspaces/:slug/projects/:projectId/announcements/:id:Announcement + 関連 Delivery / BlogPost を削除。 */
  @Delete(':id')
  @Roles(...WRITER_ROLES)
  async delete(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.delete(ws.tenantId, projectId, id);
  }

  /**
   * POST /workspaces/:slug/projects/:projectId/announcements/:id/generate:Sonnet 4 で多チャネル文面を生成。
   * 月次クォータ(`assertWithinAnnouncementQuota`)に従い、FREE プランは 403。
   */
  @Post(':id/generate')
  @Roles(...WRITER_ROLES)
  async generate(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: GenerateAnnouncementDto,
  ) {
    return this.service.generate({
      tenantId: ws.tenantId,
      projectId,
      id,
      userId: ws.userId,
      plan: ws.plan,
      dto,
    });
  }

  /**
   * POST /workspaces/:slug/projects/:projectId/announcements/:id/deliveries/:deliveryId/execute:
   * Delivery 単位の同期実行(MVP)。Twitter = POST tweet / Blog = publishedAt セット。
   * 失敗時は Delivery.status = FAILED + ユーザー向け文言を保存し、例外を上位に伝播。
   */
  @Post(':id/deliveries/:deliveryId/execute')
  @Roles(...WRITER_ROLES)
  async execute(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.service.executeDelivery({
      tenantId: ws.tenantId,
      projectId,
      announcementId: id,
      deliveryId,
      userId: ws.userId,
    });
  }
}
