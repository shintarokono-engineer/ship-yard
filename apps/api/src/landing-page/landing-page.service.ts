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
}
