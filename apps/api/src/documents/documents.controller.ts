import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { DocumentsService } from './documents.service';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';

/**
 * プロジェクトに紐付くドキュメント(README / LP / 告知文 等)の参照 API。
 * 作成は AI 生成エンドポイント(`POST .../documents/generate`、`ai/draft-gen.controller.ts`)が担う。
 * 参照はテナントメンバーなら誰でも可。未所属 / slug・project・document 不在はすべて 404。
 */
@Controller('workspaces/:slug/projects/:projectId/documents')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** GET /workspaces/:slug/projects/:projectId/documents[?type=README|LANDING_PAGE|...] — 一覧(本文なし)。 */
  @Get()
  list(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Query() query: ListDocumentsQueryDto,
  ) {
    return this.documents.list(ws.tenantId, projectId, query.type);
  }

  /** GET /workspaces/:slug/projects/:projectId/documents/:documentId — 1 件(本文込み)。 */
  @Get(':documentId')
  get(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documents.getOwnedOrThrow(ws.tenantId, projectId, documentId);
  }
}
