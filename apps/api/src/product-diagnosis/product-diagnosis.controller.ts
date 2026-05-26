import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { ProjectsService } from '../projects/projects.service';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { RunDiagnosisDto } from './dto/run-diagnosis.dto';
import { ProductDiagnosisService } from './product-diagnosis.service';

/**
 * プロダクト診断(PRODUCT_DIAGNOSIS、ADR-013)の API(Day 43)。
 *
 * 3 エンドポイント:
 *   - POST  /workspaces/:slug/projects/:projectId/diagnoses        新規実行(WRITER_ROLES)
 *   - GET   /workspaces/:slug/projects/:projectId/diagnoses        履歴一覧(全テナントメンバー)
 *   - GET   /workspaces/:slug/projects/:projectId/diagnoses/:id    単件取得(全テナントメンバー)
 *
 * 認証 → 所属解決 → ロール検証は `ClerkAuthGuard` → `WorkspaceGuard` + `@Roles(...)` が担う
 * (LandingPageController と同パターン)。プロジェクト存在確認は `ProjectsService.getOwnedOrThrow`
 * で 404 を統一する(存在の有無を漏らさない、ADR-003)。
 *
 * DELETE は MVP では実装しない(履歴を消されるとトレンドが分断、削除ニーズが顕在化したら v1.x)。
 */
@Controller('workspaces/:slug/projects/:projectId/diagnoses')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class ProductDiagnosisController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly diagnosis: ProductDiagnosisService,
  ) {}

  /**
   * POST /workspaces/:slug/projects/:projectId/diagnoses
   *
   * Day 43 時点では Service の `runDiagnosis` が 501(Not Implemented)を返す。
   * Day 44 で Sonnet 4 + Web Search Tool + Tool Use を実装し、本エンドポイントが正常応答する。
   *
   * 認可:WRITER_ROLES(OWNER / ADMIN / DEVELOPER)。診断は AI コスト + Web Search のレート制限
   * があるため書き込み権限相当として扱う。
   *
   * 想定エラー(Day 44 実装後):
   *   - 未所属 / slug・project 不在 → 404
   *   - VIEWER / REVIEWER / TESTER → 403(`@Roles`)
   *   - Free フォールバック状態 → 403(`assertWithinDiagnosisQuota`)
   *   - Pro/Team で月次上限超過 → 403
   *   - LLM が不正レスポンス(totalScore 不一致 等) → 502(`AIBadResponseError`)
   */
  @Post()
  @Roles(...WRITER_ROLES)
  async create(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Body() dto: RunDiagnosisDto,
  ) {
    const project = await this.projects.getOwnedOrThrow(ws.tenantId, projectId);
    const { score } = await this.diagnosis.runDiagnosis({
      tenantId: ws.tenantId,
      projectId: project.id,
      userId: ws.userId,
      plan: ws.plan,
      instructions: dto.instructions?.trim() || undefined,
    });
    return score;
  }

  /**
   * GET /workspaces/:slug/projects/:projectId/diagnoses
   *
   * テナント + プロジェクトの診断履歴を新しい順で全件返す。
   * 閲覧のみなので `@Roles` は付けず全テナントメンバーが参照可(履歴比較画面用、Day 45-46)。
   */
  @Get()
  async list(@CurrentWorkspace() ws: WorkspaceAccess, @Param('projectId') projectId: string) {
    await this.projects.getOwnedOrThrow(ws.tenantId, projectId);
    return this.diagnosis.getHistory(ws.tenantId, projectId);
  }

  /**
   * GET /workspaces/:slug/projects/:projectId/diagnoses/:id
   *
   * 特定の診断結果(breakdown / suggestions / competitorRefs の全文)を取得する。
   * `tenantId` フィルタでテナント越境を防ぐ。他テナント / 不在は 404(存在の有無を漏らさない)。
   */
  @Get(':id')
  async getById(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projects.getOwnedOrThrow(ws.tenantId, projectId);
    return this.diagnosis.getById(ws.tenantId, id);
  }
}
