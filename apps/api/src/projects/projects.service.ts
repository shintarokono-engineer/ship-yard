import { Injectable, NotFoundException } from '@nestjs/common';

import type { Prisma, ProjectStatus } from '@shipyard/db';

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
    // 先に所属確認(404)。id は PK なので以降の where は id だけで十分。
    await this.assertExists(tenantId, projectId);
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
        launchDate: this.toLaunchDate(dto.launchDate),
      },
      select: PROJECT_DETAIL_SELECT,
    });
  }

  async remove(tenantId: string, projectId: string): Promise<void> {
    await this.assertExists(tenantId, projectId);
    // ChecklistItem / ProjectDocument は schema 側 onDelete: Cascade で連鎖削除される。
    await this.prisma.project.delete({ where: { id: projectId } });
  }
}
