import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { DocumentsService } from './documents.service';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { UpdateProjectDocumentDto } from './dto/update-project-document.dto';

/**
 * プロジェクトに紐付くドキュメント(README / 告知文 等)の API。
 * LP は §9.12.1 で `DocType` から削除済(ADR-009 の `LandingPage` 専用テーブル経路へ移行)。
 *
 * - 参照(`GET`): テナントメンバーなら誰でも可。
 * - 編集(`PATCH`): WRITER 以上。**append-only** で元行は変更せず、新しい version の行を作る。
 * - 削除(`DELETE`): WRITER 以上。**行単位 soft delete**(`deletedAt` に UTC now)、204 No Content。
 * - AI による初版生成は別エンドポイント(`POST .../documents/generate`、`ai/draft-gen.controller.ts`)。
 *
 * 未所属 / slug・project・document 不在 / soft delete 済みは全て 404。
 */
@Controller('workspaces/:slug/projects/:projectId/documents')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** GET /workspaces/:slug/projects/:projectId/documents[?type=README|RELEASE_BLOG|...] — 一覧(本文なし、soft delete 済みは除外)。 */
  @Get()
  list(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Query() query: ListDocumentsQueryDto,
  ) {
    return this.documents.list(ws.tenantId, projectId, query.type);
  }

  /** GET /workspaces/:slug/projects/:projectId/documents/:documentId — 1 件(本文込み、soft delete 済みは 404)。 */
  @Get(':documentId')
  get(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documents.getOwnedOrThrow(ws.tenantId, projectId, documentId);
  }

  /**
   * PATCH /workspaces/:slug/projects/:projectId/documents/:documentId — 編集(WRITER 以上、append-only)。
   * 元行は変更せず、同じ `(projectId, type)` で新しい version の行を作って返す。
   * title / content の少なくとも一方が必要(両方欠落は 400)。
   */
  @Patch(':documentId')
  @Roles(...WRITER_ROLES)
  edit(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateProjectDocumentDto,
  ) {
    // 新版の createdById は呼び出しユーザー(WorkspaceGuard が解決した内部 User ID)。
    return this.documents.edit(ws.tenantId, projectId, documentId, ws.userId, dto);
  }

  /**
   * DELETE /workspaces/:slug/projects/:projectId/documents/:documentId — soft delete(WRITER 以上、204)。
   * 物理削除はせず deletedAt に UTC now を入れる。2 回目の DELETE は 404(冪等性より明示性を優先)。
   *
   * Project の DELETE は ADMIN_ROLES なのに対し、ここを WRITER_ROLES に下げているのは:
   * - 子リソースを連鎖削除しない(Document 単体の削除で済む、blast radius が小さい)
   * - soft delete なので誤削除しても DB レベルでは復旧可能(Project の物理削除と違う)
   */
  @Delete(':documentId')
  @Roles(...WRITER_ROLES)
  @HttpCode(204)
  async softDelete(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ): Promise<void> {
    await this.documents.softDelete(ws.tenantId, projectId, documentId);
  }
}
