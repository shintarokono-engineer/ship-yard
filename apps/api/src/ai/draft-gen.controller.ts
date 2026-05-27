import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { Feature } from '@shipyard/db';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { DocumentsService } from '../documents/documents.service';
import { ProjectsService } from '../projects/projects.service';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { AIUsageService } from './ai-usage.service';
import { DraftGenService } from './draft-gen.service';
import { GenerateDocumentDto } from './dto/generate-document.dto';
import { RagSearchService } from './rag-search.service';

/**
 * AI によるドキュメントドラフト生成 API(DRAFT_GEN、ADR-005)。
 *
 * 認証 → 所属解決 → 書き込み権限チェックは `ClerkAuthGuard` → `WorkspaceGuard`(`@Roles(...WRITER_ROLES)`)が担う。
 * リクエストボディの検証(`docType` は README / LANDING_PAGE のみ等)は `GenerateDocumentDto` + `ValidationPipe`。
 * 本処理: 親プロジェクト取得 → Free プランの月次 AI 上限チェック → Sonnet 4 + Tool Use で生成 →
 * `DocumentsService.createDraft` で ProjectDocument 保存 → `AIUsageService.record` で利用記録。
 */
@Controller('workspaces/:slug/projects/:projectId/documents')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class DraftGenController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly documents: DocumentsService,
    private readonly draftGen: DraftGenService,
    private readonly aiUsage: AIUsageService,
    private readonly ragSearch: RagSearchService,
  ) {}

  /**
   * POST /workspaces/:slug/projects/:projectId/documents/generate
   * - 未所属 / slug・project 不在 → 404(存在の有無を漏らさない)
   * - DEVELOPER 未満のロール → 403(`WorkspaceGuard` + `@Roles`)
   * - Free プランの月次 AI 上限超過 → 403
   * - docType が README / LANDING_PAGE 以外 → 400(`GenerateDocumentDto`)
   */
  @Post('generate')
  @Roles(...WRITER_ROLES)
  async generate(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Body() dto: GenerateDocumentDto,
  ) {
    const project = await this.projects.getOwnedOrThrow(ws.tenantId, projectId);

    // Free プランの月次 AI 上限チェック(超過なら 403)。AI を呼ぶ前に。
    await this.aiUsage.assertWithinPlanCredits({ id: ws.tenantId, plan: ws.plan });

    const instructions = dto.instructions?.trim() || undefined;

    // RAG: 過去ドキュメントを意味検索して prompt に注入(ADR-005 の独自性コア)。
    // クエリは「プロジェクト名 + 概要 + 追加指示」で構成。自プロジェクトのドキュメントは除外。
    // 失敗してもメイン生成は止めない方針(EmbeddingService と同じ「主処理を守る」設計)。
    const searchQuery = [project.name, project.description ?? '', instructions ?? '']
      .filter((s) => s && s.trim())
      .join('\n');
    const rag = await this.ragSearch.searchSimilar(ws.tenantId, searchQuery, {
      excludeProjectId: project.id,
    });

    // RagSearchHit extends RagReference なので rag.hits をそのまま references に渡せる。
    const draft = await this.draftGen.generate({
      project: { name: project.name, description: project.description, status: project.status },
      kind: dto.docType,
      instructions,
      references: rag.hits,
    });

    const document = await this.documents.createDraft({
      tenantId: ws.tenantId,
      projectId: project.id,
      userId: ws.userId,
      type: dto.docType,
      title: draft.title,
      content: draft.content,
    });

    // AI 利用記録(課金・Free 上限判定の根拠なので取りこぼし禁止、ADR-005)
    // 検索クエリの embedding と本生成は別 record(model が異なるため、単価計算が分岐する)
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
      model: draft.model,
      feature: Feature.DRAFT_GEN,
      tokensIn: draft.tokensIn,
      tokensOut: draft.tokensOut,
    });

    return document;
  }
}
