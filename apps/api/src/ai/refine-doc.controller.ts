import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { Feature } from '@shipyard/db';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { DocumentsService } from '../documents/documents.service';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { AIUsageService } from './ai-usage.service';
import { RefineDocumentDto } from './dto/refine-document.dto';
import { RagSearchService } from './rag-search.service';
import { RefineDocService } from './refine-doc.service';

/**
 * AI による既存ドキュメント推敲 API(REFINE_DOC、ADR-005、Day 14)。
 *
 * Day 7 の DRAFT_GEN(新規生成)に対し、こちらは「既存 ProjectDocument を Sonnet 4 で推敲し
 * append-only で新版を作る」ユースケース。Day 10 の `DocumentsService.edit`(MAX(version)+1)に乗せる。
 *
 * 認証 → 所属解決 → 書き込み権限チェックは `ClerkAuthGuard` → `WorkspaceGuard`(`@Roles(...WRITER_ROLES)`)が担う。
 * リクエストボディの検証(任意 goal ≤ 1000 文字)は `RefineDocumentDto` + `ValidationPipe`。
 */
@Controller('workspaces/:slug/projects/:projectId/documents')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class RefineDocController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly refineDoc: RefineDocService,
    private readonly aiUsage: AIUsageService,
    private readonly ragSearch: RagSearchService,
  ) {}

  /**
   * POST /workspaces/:slug/projects/:projectId/documents/:documentId/refine
   * - 未所属 / slug・project・document 不在(削除済み含む)→ 404
   * - DEVELOPER 未満のロール → 403(`WorkspaceGuard` + `@Roles`)
   * - Free プランの月次 AI 上限超過 → 403
   * - goal が 1000 文字超 → 400(`RefineDocumentDto`)
   *
   * 処理フロー:
   *   親 Project 取得(404 防御) → 元 Document 取得(404 防御、deletedAt: null)
   *   → Free 上限チェック → RAG 検索(他プロジェクトを参考) → Sonnet 4 で推敲
   *   → DocumentsService.edit で新版 INSERT(自動 hook で embedding 更新)
   *   → AIUsage を二段で記録(検索 embedding と本生成、別 record)
   */
  @Post(':documentId/refine')
  @Roles(...WRITER_ROLES)
  async refine(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Body() dto: RefineDocumentDto,
  ) {
    // 親 Project の存在は documents.getOwnedOrThrow が内部で assertExists するので、
    // ここで projects.getOwnedOrThrow を呼ぶ必要はない(2 度クエリを飛ばさない)。
    const original = await this.documents.getOwnedOrThrow(ws.tenantId, projectId, documentId);

    // Free プランの月次 AI 上限チェック(超過なら 403)。AI を呼ぶ前に。
    await this.aiUsage.assertWithinFreeQuota({ id: ws.tenantId, plan: ws.plan });

    const goal = dto.goal?.trim() || undefined;

    // RAG: 過去ドキュメントを意味検索して prompt に注入(ADR-005 の独自性コア)。
    // クエリは「元タイトル + 元本文の冒頭 1000 文字 + goal」で構成(全文だと冒頭の章立てだけで類似度が決まる)。
    // 自プロジェクトのドキュメントは除外。失敗してもメイン推敲は止めない(RagSearchService 内部で握りつぶし)。
    const contentExcerpt = original.content.slice(0, 1000);
    const searchQuery = [original.title, contentExcerpt, goal ?? '']
      .filter((s) => s && s.trim())
      .join('\n');
    const rag = await this.ragSearch.searchSimilar(ws.tenantId, searchQuery, {
      excludeProjectId: projectId,
    });

    const refined = await this.refineDoc.refine({
      original: { type: original.type, title: original.title, content: original.content },
      goal,
      references: rag.hits.map((hit) => ({ title: hit.title, content: hit.content })),
    });

    // append-only で新版作成(Day 10 の edit 仕組みに乗せる)。embedAfterWrite が自動で走る。
    // edit は patch: { title?, content? } を受けるので AI 経路から plain object を直接渡せる。
    const newVersion = await this.documents.edit(ws.tenantId, projectId, documentId, ws.userId, {
      title: refined.title,
      content: refined.content,
    });

    // AI 利用記録(課金・Free 上限判定の根拠なので取りこぼし禁止、ADR-005)。
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
      model: refined.model,
      feature: Feature.REFINE_DOC,
      tokensIn: refined.tokensIn,
      tokensOut: refined.tokensOut,
    });

    return newVersion;
  }
}
