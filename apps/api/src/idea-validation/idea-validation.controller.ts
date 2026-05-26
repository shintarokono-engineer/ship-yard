import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { ProjectsService } from '../projects/projects.service';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { RunValidationDto } from './dto/run-validation.dto';
import { IdeaValidationService } from './idea-validation.service';

/**
 * アイデア検証(IDEA_VALIDATION、ADR-013 改訂版「2 モード化」)の API(Day 44)。
 *
 * 3 エンドポイント(ProductDiagnosisController と同パターン):
 *   - POST  /workspaces/:slug/projects/:projectId/idea-validations        新規実行(WRITER_ROLES)
 *   - GET   /workspaces/:slug/projects/:projectId/idea-validations        履歴一覧(全テナントメンバー)
 *   - GET   /workspaces/:slug/projects/:projectId/idea-validations/:id    単件取得(全テナントメンバー)
 *
 * Project.status = IDEA のときに使う想定。FE 側で status をチェックしてボタン表示制御するが、
 * BE はチェックしない(検証履歴は status 遷移後も参照可能であるべき)。
 *
 * DELETE は MVP では実装しない(履歴を消されると Pivot 経緯が分からなくなる、v1.x で検討)。
 */
@Controller('workspaces/:slug/projects/:projectId/idea-validations')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class IdeaValidationController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly validation: IdeaValidationService,
  ) {}

  /**
   * POST /workspaces/:slug/projects/:projectId/idea-validations
   *
   * Day 44 時点では Service の `runValidation` が 501(Not Implemented)を返す。
   * Day 45 で Sonnet 4 + Web Search Tool + Tool Use を実装し、本エンドポイントが正常応答する。
   *
   * 認可:WRITER_ROLES。アイデア検証は AI コストがあるため書き込み権限相当として扱う。
   */
  @Post()
  @Roles(...WRITER_ROLES)
  async create(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Body() dto: RunValidationDto,
  ) {
    const project = await this.projects.getOwnedOrThrow(ws.tenantId, projectId);
    const { validation } = await this.validation.runValidation({
      tenantId: ws.tenantId,
      projectId: project.id,
      userId: ws.userId,
      plan: ws.plan,
      instructions: dto.instructions?.trim() || undefined,
    });
    return validation;
  }

  /**
   * GET /workspaces/:slug/projects/:projectId/idea-validations
   * テナント + プロジェクトの検証履歴を新しい順で全件返す。閲覧のみなので全テナントメンバーが参照可。
   */
  @Get()
  async list(@CurrentWorkspace() ws: WorkspaceAccess, @Param('projectId') projectId: string) {
    await this.projects.getOwnedOrThrow(ws.tenantId, projectId);
    return this.validation.getHistory(ws.tenantId, projectId);
  }

  /**
   * GET /workspaces/:slug/projects/:projectId/idea-validations/:id
   * 特定の検証結果(breakdown / suggestions / competitorRefs / recommendation の全文)を取得する。
   * `tenantId` フィルタでテナント越境を防ぐ。他テナント / 不在は 404。
   */
  @Get(':id')
  async getById(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projects.getOwnedOrThrow(ws.tenantId, projectId);
    return this.validation.getById(ws.tenantId, id);
  }
}
