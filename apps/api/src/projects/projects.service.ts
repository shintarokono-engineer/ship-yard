import { Injectable, NotFoundException } from '@nestjs/common';

import { isPrismaError, type Prisma, PrismaErrorCode, type ProjectStatus } from '@shipyard/db';

import { dayjs } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';

/** API レスポンスで返す Project のフィールド。 */
const PROJECT_SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  launchDate: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;

/** 一覧・詳細では子要素の件数も添える(チェックリスト / 生成済みドキュメントの数)。 */
const PROJECT_DETAIL_SELECT = {
  ...PROJECT_SELECT,
  _count: { select: { checklist: true, documents: true } },
} satisfies Prisma.ProjectSelect;

/**
 * Project の CRUD ロジック。すべて `tenantId` を `where`/`data` に明示注入してテナント分離を担保する
 * (`workspaces/:slug/...` ルートは `WorkspaceGuard`(`MembershipService` 経由)がアクセスを解決し、
 * ALS のテナントコンテキストは設定しないため、自動注入には依存しない)。
 */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /** リリース日文字列(任意)を Date に変換。未指定は undefined(= Prisma で「更新しない/null」)。 */
  private toLaunchDate(value: string | undefined): Date | undefined {
    return value ? dayjs.utc(value).toDate() : undefined;
  }

  create(tenantId: string, userId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        tenantId,
        createdById: userId,
        name: dto.name,
        description: dto.description,
        status: dto.status,
        launchDate: this.toLaunchDate(dto.launchDate),
      },
      select: PROJECT_DETAIL_SELECT,
    });
  }

  list(tenantId: string, status?: ProjectStatus) {
    return this.prisma.project.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      select: PROJECT_DETAIL_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getOwnedOrThrow(tenantId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: PROJECT_DETAIL_SELECT,
    });
    if (!project) throw new NotFoundException();
    return project;
  }

  /** プロジェクトがこのテナントに存在しなければ 404(子リソースのコントローラから使う)。 */
  async assertExists(tenantId: string, projectId: string): Promise<void> {
    const found = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException();
  }

  async update(tenantId: string, projectId: string, dto: UpdateProjectDto) {
    // extendedWhereUnique で id(ユニーク)+ tenantId(分離キー)を一括指定。
    // 該当が無ければ Prisma が P2025 を投げるので 404 に変換する(原子的・テナント外のレコードは触れない)。
    try {
      return await this.prisma.project.update({
        where: { id: projectId, tenantId },
        data: {
          name: dto.name,
          description: dto.description,
          status: dto.status,
          launchDate: this.toLaunchDate(dto.launchDate),
        },
        select: PROJECT_DETAIL_SELECT,
      });
    } catch (e) {
      this.throwNotFoundIfMissing(e);
    }
  }

  async remove(tenantId: string, projectId: string): Promise<void> {
    try {
      // ChecklistItem / ProjectDocument は schema 側 onDelete: Cascade で連鎖削除される。
      await this.prisma.project.delete({ where: { id: projectId, tenantId } });
    } catch (e) {
      this.throwNotFoundIfMissing(e);
    }
  }

  /** Prisma の「対象レコードなし」を 404 に変換。それ以外はそのまま再 throw。 */
  private throwNotFoundIfMissing(e: unknown): never {
    if (isPrismaError(e, PrismaErrorCode.RECORD_NOT_FOUND)) {
      throw new NotFoundException();
    }
    throw e;
  }
}
