import { Injectable, NotFoundException } from '@nestjs/common';

import { type DocType, isPrismaError, type Prisma, PrismaErrorCode } from '@shipyard/db';

import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

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
      where: { tenantId, projectId, ...(type ? { type } : {}) },
      select: DOCUMENT_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOwnedOrThrow(tenantId: string, projectId: string, documentId: string) {
    await this.projects.assertExists(tenantId, projectId);
    const document = await this.prisma.projectDocument.findFirst({
      where: { id: documentId, projectId, tenantId },
      select: DOCUMENT_DETAIL_SELECT,
    });
    if (!document) throw new NotFoundException();
    return document;
  }

  /** `createDraft` の version 競合時に数え直す最大回数。 */
  private static readonly CREATE_DRAFT_MAX_RETRIES = 3;

  /**
   * AI が生成したドラフトを保存する。`version` は同一 (projectId, type) 内で v1, v2, ... と増加
   * (schema の `@@unique([projectId, type, version])` で担保。並行生成で同じ version を取り合った場合は
   * P2002 になるので、数え直してリトライする)。`embedding` は後続タスク(OpenAI text-embedding-3-small)で別途埋める。
   */
  async createDraft(params: {
    tenantId: string;
    projectId: string;
    userId: string;
    type: DocType;
    title: string;
    content: string;
  }) {
    for (let attempt = 0; attempt < DocumentsService.CREATE_DRAFT_MAX_RETRIES; attempt++) {
      const priorCount = await this.prisma.projectDocument.count({
        where: { tenantId: params.tenantId, projectId: params.projectId, type: params.type },
      });
      try {
        return await this.prisma.projectDocument.create({
          data: {
            tenantId: params.tenantId,
            projectId: params.projectId,
            type: params.type,
            title: params.title,
            content: params.content,
            version: priorCount + 1,
            createdById: params.userId,
          },
          select: DOCUMENT_DETAIL_SELECT,
        });
      } catch (e) {
        // unique 制約違反(version の取り合い)→ 数え直して再試行。それ以外はそのまま投げる。
        if (isPrismaError(e, PrismaErrorCode.UNIQUE_VIOLATION)) {
          continue;
        }
        throw e;
      }
    }
    throw new Error('Failed to assign a unique version for the generated document after retries');
  }
}
