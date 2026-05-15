import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { Feature } from '@shipyard/db';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { ChecklistService } from '../checklist/checklist.service';
import { ProjectsService } from '../projects/projects.service';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { AIUsageService } from './ai-usage.service';
import { ChecklistGenService } from './checklist-gen.service';
import { GenerateChecklistDto } from './dto/generate-checklist.dto';
import { RagSearchService } from './rag-search.service';

/**
 * AI によるリリース前チェックリスト一括生成 API(CHECKLIST_GEN、ADR-005)。
 *
 * 認証 → 所属解決 → 書き込み権限チェックは `ClerkAuthGuard` → `WorkspaceGuard`(`@Roles(...WRITER_ROLES)`)が担う。
 * リクエストボディの検証(任意 instructions / categories の絞り込み)は `GenerateChecklistDto` + `ValidationPipe`。
 * 本処理: 親プロジェクト取得 → Free プランの月次 AI 上限チェック → Haiku 4.5 + Tool Use で生成 →
 * `ChecklistService.bulkCreate` で `createManyAndReturn`(原子的)→ `AIUsageService.record` で利用記録。
 */
@Controller('workspaces/:slug/projects/:projectId/checklist')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class ChecklistGenController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly checklist: ChecklistService,
    private readonly checklistGen: ChecklistGenService,
    private readonly aiUsage: AIUsageService,
    private readonly ragSearch: RagSearchService,
  ) {}

  /**
   * POST /workspaces/:slug/projects/:projectId/checklist/generate
   * - 未所属 / slug・project 不在 → 404(存在の有無を漏らさない)
   * - DEVELOPER 未満のロール → 403(`WorkspaceGuard` + `@Roles`)
   * - Free プランの月次 AI 上限超過 → 403
   * - 不正な categories(未知の enum 値等) → 400(`GenerateChecklistDto`)
   *
   * 既存の項目を考慮せず追加生成するため、繰り返し呼ぶと重複が発生し得る(MVP では呼び出し側で削除して整理する想定)。
   */
  @Post('generate')
  @Roles(...WRITER_ROLES)
  async generate(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Body() dto: GenerateChecklistDto,
  ) {
    const project = await this.projects.getOwnedOrThrow(ws.tenantId, projectId);

    // Free プランの月次 AI 上限チェック(超過なら 403)。AI を呼ぶ前に。
    await this.aiUsage.assertWithinFreeQuota({ id: ws.tenantId, plan: ws.plan });

    const instructions = dto.instructions?.trim() || undefined;

    // RAG: 過去ドキュメントを意味検索して prompt に注入(ADR-005 の独自性コア)。
    // クエリは「プロジェクト名 + 概要 + 追加指示」で構成。自プロジェクトのドキュメントは除外。
    // 失敗してもメイン生成は止めない方針(RagSearchService 内部で握りつぶし → 空ヒット返す)。
    const searchQuery = [project.name, project.description ?? '', instructions ?? '']
      .filter((s) => s && s.trim())
      .join('\n');
    const rag = await this.ragSearch.searchSimilar(ws.tenantId, searchQuery, {
      excludeProjectId: project.id,
    });

    // RagSearchHit extends RagReference なので rag.hits をそのまま references に渡せる。
    const generated = await this.checklistGen.generate({
      project: { name: project.name, description: project.description, status: project.status },
      instructions,
      categories: dto.categories,
      references: rag.hits,
    });

    // position は既存項目の最大値 + 1 から振り直す(既存項目より後ろに並ぶ)。
    // 既存件数 = `_count.checklist`(getOwnedOrThrow が DETAIL_SELECT で返す)。
    const existing = project._count?.checklist ?? 0;
    const items = await this.checklist.bulkCreate(ws.tenantId, project.id, generated.items, {
      baseOffset: existing,
    });

    // AI 利用記録(課金・Free 上限判定の根拠なので取りこぼし禁止、ADR-005)
    // 検索クエリの embedding と本生成は別 record(model が異なるため、単価計算が分岐する)。
    // OTHER は assertWithinFreeQuota の上限カウントから除外される(ai-usage.service.ts 参照)。
    if (rag.tokensIn > 0) {
      await this.aiUsage.record({
        tenantId: ws.tenantId,
        userId: ws.userId,
        model: rag.model,
        feature: Feature.OTHER,
        tokensIn: rag.tokensIn,
        tokensOut: 0,
      });
    }
    await this.aiUsage.record({
      tenantId: ws.tenantId,
      userId: ws.userId,
      model: generated.model,
      feature: Feature.CHECKLIST_GEN,
      tokensIn: generated.tokensIn,
      tokensOut: generated.tokensOut,
    });

    return { items };
  }
}
