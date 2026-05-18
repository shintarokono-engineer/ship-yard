import { Injectable, NotFoundException } from '@nestjs/common';

import { type Category, isPrismaError, type Prisma, PrismaErrorCode } from '@shipyard/db';

import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import type { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import type { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';

/** API レスポンスで返す ChecklistItem のフィールド。 */
const CHECKLIST_ITEM_SELECT = {
  id: true,
  projectId: true,
  parentId: true,
  category: true,
  title: true,
  description: true,
  status: true,
  position: true,
  createdAt: true,
} satisfies Prisma.ChecklistItemSelect;

/**
 * ChecklistItem(リリース前チェックリスト項目)の CRUD ロジック。
 * すべて `tenantId` + `projectId` を `where`/`data` に明示注入してテナント/プロジェクト分離を担保する
 * (path slug ベースのルートは ALS のテナントコンテキストを持たないため、自動注入には依存しない)。
 * 子リソースのため、参照・作成時は先に親 Project の存在をテナント内で確認する。
 */
@Injectable()
export class ChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async create(tenantId: string, projectId: string, dto: CreateChecklistItemDto) {
    await this.projects.assertExists(tenantId, projectId);
    return this.prisma.checklistItem.create({
      data: {
        tenantId,
        projectId,
        category: dto.category,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        position: dto.position,
      },
      select: CHECKLIST_ITEM_SELECT,
    });
  }

  /**
   * 複数の ChecklistItem を一括作成して、作成行を一覧 SELECT 相当の形で返す(AI 生成からの呼び出しを想定)。
   * `createManyAndReturn` は 1 トランザクションで原子的に挿入するため、途中失敗で半端に行が残らない。
   * `position` は配列インデックス順に割り振り(`baseOffset + index`)、表示順をそのまま反映させる。
   *
   * `parentId` を渡すと全項目が同じ親 ChecklistItem に紐付く(TASK_SPLIT のサブタスク用)。
   * 渡さなければ NULL のまま(CHECKLIST_GEN のフラット生成用)。
   */
  async bulkCreate(
    tenantId: string,
    projectId: string,
    items: readonly {
      category: Category;
      title: string;
      description?: string;
    }[],
    options: { baseOffset?: number; parentId?: string } = {},
  ) {
    await this.projects.assertExists(tenantId, projectId);
    if (items.length === 0) return [];
    const baseOffset = options.baseOffset ?? 0;
    const parentId = options.parentId;
    return this.prisma.checklistItem.createManyAndReturn({
      data: items.map((item, index) => ({
        tenantId,
        projectId,
        parentId,
        category: item.category,
        title: item.title,
        description: item.description,
        position: baseOffset + index,
      })),
      select: CHECKLIST_ITEM_SELECT,
    });
  }

  async list(tenantId: string, projectId: string, category?: Category) {
    await this.projects.assertExists(tenantId, projectId);
    return this.prisma.checklistItem.findMany({
      where: { tenantId, projectId, ...(category ? { category } : {}) },
      select: CHECKLIST_ITEM_SELECT,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getOwnedOrThrow(tenantId: string, projectId: string, itemId: string) {
    await this.projects.assertExists(tenantId, projectId);
    const item = await this.prisma.checklistItem.findFirst({
      where: { id: itemId, projectId, tenantId },
      select: CHECKLIST_ITEM_SELECT,
    });
    if (!item) throw new NotFoundException();
    return item;
  }

  async update(tenantId: string, projectId: string, itemId: string, dto: UpdateChecklistItemDto) {
    // extendedWhereUnique で id(ユニーク)+ tenantId + projectId を一括指定。該当が無ければ P2025 → 404。
    try {
      return await this.prisma.checklistItem.update({
        where: { id: itemId, tenantId, projectId },
        data: {
          category: dto.category,
          title: dto.title,
          description: dto.description,
          status: dto.status,
          position: dto.position,
        },
        select: CHECKLIST_ITEM_SELECT,
      });
    } catch (e) {
      if (isPrismaError(e, PrismaErrorCode.RECORD_NOT_FOUND)) throw new NotFoundException();
      throw e;
    }
  }

  async remove(tenantId: string, projectId: string, itemId: string): Promise<void> {
    try {
      await this.prisma.checklistItem.delete({ where: { id: itemId, tenantId, projectId } });
    } catch (e) {
      if (isPrismaError(e, PrismaErrorCode.RECORD_NOT_FOUND)) throw new NotFoundException();
      throw e;
    }
  }
}
