import { Injectable, NotFoundException } from '@nestjs/common';

import { type DocType, isPrismaError, type Prisma, PrismaErrorCode } from '@shipyard/db';

import { dayjs } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import type { UpdateProjectDocumentDto } from './dto/update-project-document.dto';

/** 一覧で返すフィールド(本文 content は大きくなりがちなので含めない)。 */
const DOCUMENT_LIST_SELECT = {
  id: true,
  type: true,
  title: true,
  version: true,
  createdById: true,
  createdAt: true,
} satisfies Prisma.ProjectDocumentSelect;

/** 1 件取得・作成時に返すフィールド(本文込み)。 */
const DOCUMENT_DETAIL_SELECT = {
  ...DOCUMENT_LIST_SELECT,
  content: true,
} satisfies Prisma.ProjectDocumentSelect;

/**
 * ProjectDocument の永続化を担う Service。すべて `tenantId` を `where`/`data` に明示注入してテナント分離を担保する
 * (path slug ベースのルートは ALS のテナントコンテキストを持たないため、自動注入には依存しない)。
 * 子リソースのため、先に親 Project の存在をテナント内で確認する。
 *
 * **append-only ポリシー**:
 * - 1 行 = 1 リビジョン。`(projectId, type)` 内で `version` が増加(欠番を許す)。
 * - **編集**(`edit`): 元行を UPDATE せず、新しい version の行を INSERT する。
 * - **削除**(`softDelete`): 物理削除せず、`deletedAt` に UTC now を入れる行単位 soft delete。
 * - **参照**(`list` / `getOwnedOrThrow`): 常に `deletedAt: null` で絞る。
 * - **新版作成時の version 計算**(`createDraft` / `edit`): `findFirst orderBy version desc` で
 *   取得した MAX(version) + 1。soft delete 済み行も MAX に含めて欠番を許し、version を再利用しない
 *   (物理削除ジョブが将来入っても version が衝突しないため)。
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async list(tenantId: string, projectId: string, type?: DocType) {
    await this.projects.assertExists(tenantId, projectId);
    return this.prisma.projectDocument.findMany({
      where: { tenantId, projectId, deletedAt: null, ...(type ? { type } : {}) },
      select: DOCUMENT_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOwnedOrThrow(tenantId: string, projectId: string, documentId: string) {
    await this.projects.assertExists(tenantId, projectId);
    const document = await this.prisma.projectDocument.findFirst({
      where: { id: documentId, projectId, tenantId, deletedAt: null },
      select: DOCUMENT_DETAIL_SELECT,
    });
    if (!document) throw new NotFoundException();
    return document;
  }

  /** `createDraft` / `edit` の version 競合時に数え直す最大回数。 */
  private static readonly NEW_VERSION_MAX_RETRIES = 3;

  /**
   * AI が生成したドラフトを `(projectId, type)` の新しい version として保存する。
   * version 採番と並行衝突リトライは `appendNewVersion` に委譲。
   * `embedding` は後続タスク(OpenAI `text-embedding-3-small`)で別途埋める。
   */
  async createDraft(params: {
    tenantId: string;
    projectId: string;
    userId: string;
    type: DocType;
    title: string;
    content: string;
  }) {
    return this.appendNewVersion({
      tenantId: params.tenantId,
      projectId: params.projectId,
      type: params.type,
      buildData: (nextVersion) => ({
        tenantId: params.tenantId,
        projectId: params.projectId,
        type: params.type,
        title: params.title,
        content: params.content,
        version: nextVersion,
        createdById: params.userId,
      }),
    });
  }

  /**
   * 既存ドキュメントを編集する(append-only)。元行は変更せず、同じ `(projectId, type)` で新しい version の行を作る。
   * 送られなかったフィールド(title / content)は元行から引き継ぐ。両方欠落は DTO 側の `AtLeastOneFieldDefined`
   * で 400(ValidationPipe で先に弾かれる)。AIUsage は記録しない(AI を介さない手動編集のため)。
   */
  async edit(
    tenantId: string,
    projectId: string,
    documentId: string,
    userId: string,
    dto: UpdateProjectDocumentDto,
  ) {
    // 元行(soft delete されていないもの)から type / title / content を引き継ぐため取得。同時に存在チェックも兼ねる。
    const original = await this.prisma.projectDocument.findFirst({
      where: { id: documentId, projectId, tenantId, deletedAt: null },
      select: { type: true, title: true, content: true },
    });
    if (!original) throw new NotFoundException();

    return this.appendNewVersion({
      tenantId,
      projectId,
      type: original.type,
      buildData: (nextVersion) => ({
        tenantId,
        projectId,
        type: original.type,
        title: dto.title ?? original.title,
        content: dto.content ?? original.content,
        version: nextVersion,
        createdById: userId,
      }),
    });
  }

  /**
   * ドキュメントを行単位 soft delete する(物理削除しない)。`deletedAt` に UTC now を入れて非表示化。
   * extendedWhereUnique で id + tenantId + projectId + deletedAt: null を一括指定。
   * 既に削除済み or 該当無しは P2025 → 404(冪等性は犠牲にして「2 回目の DELETE」を 404 にする方を取る)。
   */
  async softDelete(tenantId: string, projectId: string, documentId: string): Promise<void> {
    try {
      await this.prisma.projectDocument.update({
        where: { id: documentId, tenantId, projectId, deletedAt: null },
        data: { deletedAt: dayjs.utc().toDate() },
        select: { id: true },
      });
    } catch (e) {
      if (isPrismaError(e, PrismaErrorCode.RECORD_NOT_FOUND)) throw new NotFoundException();
      throw e;
    }
  }

  /**
   * `(projectId, type)` 内の MAX(version) + 1 を採番して新しい行を INSERT する共通処理。
   * 並行採番で衝突した場合 `(projectId, type, version)` の P2002 のみリトライする
   * (将来 ProjectDocument に別の unique 制約が増えても、その違反では黙ってリトライしない)。
   * soft delete 済み行も MAX に含めて欠番を許す(物理削除が将来入っても version 衝突しないため)。
   */
  private async appendNewVersion(params: {
    tenantId: string;
    projectId: string;
    type: DocType;
    buildData: (nextVersion: number) => Prisma.ProjectDocumentUncheckedCreateInput;
  }) {
    for (let _attempt = 0; _attempt < DocumentsService.NEW_VERSION_MAX_RETRIES; _attempt++) {
      // 直近の version を取って +1。soft delete 済みも含めるため where に deletedAt フィルタは付けない。
      const last = await this.prisma.projectDocument.findFirst({
        where: { tenantId: params.tenantId, projectId: params.projectId, type: params.type },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (last?.version ?? 0) + 1;
      try {
        return await this.prisma.projectDocument.create({
          data: params.buildData(nextVersion),
          select: DOCUMENT_DETAIL_SELECT,
        });
      } catch (e) {
        // (projectId, type, version) の unique 制約違反のみリトライ。それ以外の P2002 や他のエラーは再 throw。
        if (DocumentsService.isVersionUniqueViolation(e)) {
          continue;
        }
        throw e;
      }
    }
    throw new Error('Failed to assign a unique version for the document after retries');
  }

  /**
   * Prisma の P2002(unique 制約違反)のうち、`@@unique([projectId, type, version])` 違反だけを true として識別する。
   * `error.meta.target` には違反した制約のフィールド名配列が入る(Prisma の慣習)。
   * 例: `target = ['projectId', 'type', 'version']`。`version` を含むケースだけリトライ対象とする。
   */
  private static isVersionUniqueViolation(e: unknown): boolean {
    if (!isPrismaError(e, PrismaErrorCode.UNIQUE_VIOLATION)) return false;
    const target = e.meta?.target;
    return Array.isArray(target) && (target as unknown[]).includes('version');
  }
}
