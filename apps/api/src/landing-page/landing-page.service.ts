import { Injectable } from '@nestjs/common';

import { Prisma, type LandingPage } from '@shipyard/db';

import { PrismaService } from '../prisma/prisma.service';
import type { LpBlock } from './lp-blocks';

/**
 * `LandingPage`(ADR-009)の永続化を担う Service。
 *
 * `/workspaces/:slug/...` ルートは ALS のテナントコンテキストを持たないため、`tenantId` は
 * 引数で受け取り全クエリに明示注入する(implementation-rules.md「テナント解決」)。
 * テナント所属・プロジェクト存在の確認は controller 側(`WorkspaceGuard` + `ProjectsService`)が担う。
 */
@Injectable()
export class LandingPageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 生成されたブロック配列を `LandingPage` に保存する(upsert)。
   *
   * `projectId` は `@unique`(1 プロジェクト = 1 LP)なので、既存 LP があれば `blocks` を
   * 上書き(mutable 編集、append-only ではない)、無ければ新規作成する。
   * `publishedAt` は再生成では変更しない(公開中の LP を再生成しても公開状態は維持)。
   */
  async saveGenerated(
    tenantId: string,
    projectId: string,
    blocks: LpBlock[],
  ): Promise<LandingPage> {
    const blocksJson = blocks as unknown as Prisma.InputJsonValue;
    return this.prisma.landingPage.upsert({
      where: { projectId },
      create: { tenantId, projectId, blocks: blocksJson },
      update: { blocks: blocksJson },
    });
  }

  /**
   * プロジェクトの `LandingPage` を 1 件取得する(未生成なら null)。
   *
   * `projectId` は `@unique` だが、`findUnique` はテナント絞り込みを併用できないため、
   * テナント越境を防ぐ目的で `findFirst` + `tenantId` 明示注入で取得する。
   */
  async findByProject(tenantId: string, projectId: string): Promise<LandingPage | null> {
    return this.prisma.landingPage.findFirst({ where: { tenantId, projectId } });
  }

  /**
   * 既存 `LandingPage` の `blocks` を編集後の配列で上書きする(Day 32 編集 UI)。
   *
   * `update`(`where: { projectId }`)はテナント絞り込みを併用できないため、`updateMany` +
   * `tenantId` 明示注入でテナント越境を防ぐ。対象 LP が存在しなければ `null` を返す
   * (呼び出し側で 404 にする想定。LP 未生成のプロジェクトは編集できない)。
   */
  async updateBlocks(
    tenantId: string,
    projectId: string,
    blocks: LpBlock[],
  ): Promise<LandingPage | null> {
    const blocksJson = blocks as unknown as Prisma.InputJsonValue;
    const result = await this.prisma.landingPage.updateMany({
      where: { tenantId, projectId },
      data: { blocks: blocksJson },
    });
    if (result.count === 0) return null;
    return this.findByProject(tenantId, projectId);
  }
}
