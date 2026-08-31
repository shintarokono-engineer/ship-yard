import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Feature } from '@shipyard/db';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { AiJobService } from '../ai/shared/ai-job.service';
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
    private readonly aiJobs: AiJobService,
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
  @HttpCode(HttpStatus.ACCEPTED)
  async create(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Body() dto: RunValidationDto,
  ) {
    const project = await this.projects.getOwnedOrThrow(ws.tenantId, projectId);
    const { jobId } = await this.validation.startValidation({
      tenantId: ws.tenantId,
      projectId: project.id,
      userId: ws.userId,
      plan: ws.plan,
      instructions: dto.instructions?.trim() || undefined,
    });
    return { jobId };
  }

  /**
   * GET /workspaces/:slug/projects/:projectId/idea-validations/jobs/:jobId
   *
   * 実行中ジョブの進行状態を返す(ADR-016 のポーリング用)。
   * **`@Get(':id')` より前に定義すること。**後ろに置くと `jobs` が `:id` にマッチする。
   */
  /**
   * GET /workspaces/:slug/projects/:projectId/idea-validations/jobs
   *
   * 履歴一覧に混ぜて表示する「実行中」「直近の失敗」 のジョブを返す(ADR-016)。
   * DONE は結果本体が一覧に出るため含まない。
   *
   * **`@Get(':id')` より前に定義すること。**
   */
  @Get('jobs')
  async activeJobs(@CurrentWorkspace() ws: WorkspaceAccess, @Param('projectId') projectId: string) {
    const project = await this.projects.getOwnedOrThrow(ws.tenantId, projectId);
    return this.aiJobs.listActive(ws.tenantId, project.id, Feature.IDEA_VALIDATION);
  }

  @Get('jobs/:jobId')
  async job(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
  ) {
    const project = await this.projects.getOwnedOrThrow(ws.tenantId, projectId);
    const job = await this.aiJobs.get(ws.tenantId, project.id, jobId);
    if (!job) throw new NotFoundException('ジョブが見つかりません。');
    return job;
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
