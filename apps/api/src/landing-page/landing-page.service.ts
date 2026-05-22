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
   * 既存 `LandingPage` の `blocks` と `theme` を編集後の値で上書きする(Day 32 編集 UI + Phase 5a)。
   *
   * `update`(`where: { projectId }`)はテナント絞り込みを併用できないため、`updateMany` +
   * `tenantId` 明示注入でテナント越境を防ぐ。対象 LP が存在しなければ `null` を返す
   * (呼び出し側で 404 にする想定。LP 未生成のプロジェクトは編集できない)。
   */
  async updateContent(
    tenantId: string,
    projectId: string,
    blocks: LpBlock[],
    theme: string,
  ): Promise<LandingPage | null> {
    const blocksJson = blocks as unknown as Prisma.InputJsonValue;
    const result = await this.prisma.landingPage.updateMany({
      where: { tenantId, projectId },
      data: { blocks: blocksJson, theme },
    });
    if (result.count === 0) return null;
    return this.findByProject(tenantId, projectId);
  }

  /**
   * LP の公開状態を切り替える
   * `published=true` で `publishedAt` に現在時刻、
   * `false` で null。対象 LP が無ければ null(呼び出し側で 404)。
   *
   * `publishedAt` は「公開した瞬間のスナップショット」なので `new Date()` を許容(implementation-rules
   * 日付の例外)。
   */
  async setPublished(
    tenantId: string,
    projectId: string,
    published: boolean,
  ): Promise<LandingPage | null> {
    const result = await this.prisma.landingPage.updateMany({
      where: { tenantId, projectId },
      data: { publishedAt: published ? new Date() : null },
    });
    if (result.count === 0) return null;
    return this.findByProject(tenantId, projectId);
  }

  /**
   * 公開済み LP を tenant slug + projectId で取得する(公開 URL `/p/{slug}/{projectId}` 用、Day 33)。
   *
   * 未認証で叩かれる公開エンドポイント用。テナント所属の概念が無いため `tenant.slug` でテナントを
   * 特定し、`publishedAt` がセットされた LP のみ返す(未公開 / 未生成は null)。OG メタのタイトル用に
   * 親 Project の名前のみ併せて返す(`description` 等の内部フィールドは公開面に出さない)。
   */
  async findPublished(slug: string, projectId: string) {
    return this.prisma.landingPage.findFirst({
      where: { projectId, publishedAt: { not: null }, tenant: { slug } },
      include: { project: { select: { name: true } } },
    });
  }
}
