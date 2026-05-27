import { Injectable, NotFoundException } from '@nestjs/common';

import { isPrismaError, PrismaErrorCode, type Prisma, type ProjectStatus } from '@shipyard/db';

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
  // ADR-013 改訂版「2 モード化」 で追加(自由補足、Day 44)。
  targetUsers: true,
  problemStatement: true,
  proposedFeatures: true,
  pricingModel: true,
  // ADR-013 改訂版「構造化入力 v2」 で追加(構造化セレクト 2 軸、Day 46.5 案 A)。
  categoryDomain: true,
  pricingTier: true,
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

  /**
   * リリース日入力を Prisma 用に正規化する。
   * - `undefined` … キー自体送られていない → そのまま undefined を返す(Prisma は更新スキップ)
   * - `null` … 明示的な null クリア → そのまま null を返す(Prisma は列を null に更新)
   * - 文字列 … `dayjs.utc()` で UTC Date に変換して返す
   */
  private toLaunchDate(value: string | null | undefined): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return dayjs.utc(value).toDate();
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
        // 自由補足 4 フィールド(Day 44)
        targetUsers: dto.targetUsers,
        problemStatement: dto.problemStatement,
        proposedFeatures: dto.proposedFeatures,
        pricingModel: dto.pricingModel,
        // 構造化セレクト 2 フィールド(Day 46.5 案 A)
        categoryDomain: dto.categoryDomain,
        pricingTier: dto.pricingTier,
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
          // 自由補足 4 フィールド(Day 44)
          targetUsers: dto.targetUsers,
          problemStatement: dto.problemStatement,
          proposedFeatures: dto.proposedFeatures,
          pricingModel: dto.pricingModel,
          // 構造化セレクト 2 フィールド(Day 46.5 案 A)。`null` で列クリア、`undefined` でスキップ。
          // `String?` 列なので Prisma.JsonNull は不要(`null` をそのまま渡せば列クリア)。
          categoryDomain: dto.categoryDomain,
          pricingTier: dto.pricingTier,
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
