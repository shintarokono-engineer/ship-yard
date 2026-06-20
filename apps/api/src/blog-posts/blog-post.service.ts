import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { isPrismaError, PrismaErrorCode } from '@shipyard/db';

import { dayjs } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateBlogPostDto } from './dto/update-blog-post.dto';

/**
 * BlogPost(ADR-014)の永続化を担う Service。
 *
 * `/workspaces/:slug/...` ルートは ALS のテナントコンテキストを持たないため、`tenantId` は
 * 引数で受け取り全クエリに明示注入する(implementation-rules.md「テナント解決」)。
 * 公開 API(`findPublic`)はテナント所属の概念が無いため `tenant.slug` 経由で絞り込む。
 */
@Injectable()
export class BlogPostService {
  constructor(private readonly prisma: PrismaService) {}

  /** プロジェクト配下の BlogPost を新しい順で取得する(下書きも含む、管理 UI 用)。 */
  async listByProject(tenantId: string, projectId: string) {
    return this.prisma.blogPost.findMany({
      where: { tenantId, projectId },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** 単一 BlogPost をテナント + プロジェクト境界で取得する。未存在は 404。 */
  async getById(tenantId: string, projectId: string, id: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { id, tenantId, projectId },
    });
    if (!post) {
      throw new NotFoundException('指定されたブログ記事が見つかりません。');
    }
    return post;
  }

  /**
   * BlogPost を更新する(タイトル / 本文 / slug / 公開状態)。
   *
   * slug 重複(`@@unique([tenantId, projectId, slug])`)は `ConflictException` に変換し、
   * ユーザー向けに「この slug は既に使われています」とフィードバックする。
   */
  async update(tenantId: string, projectId: string, id: string, dto: UpdateBlogPostDto) {
    const existing = await this.getById(tenantId, projectId, id);
    try {
      return await this.prisma.blogPost.update({
        where: { id: existing.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.body !== undefined ? { body: dto.body } : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
          ...(dto.published !== undefined
            ? { publishedAt: dto.published ? dayjs.utc().toDate() : null }
            : {}),
        },
      });
    } catch (err) {
      if (isPrismaError(err, PrismaErrorCode.UNIQUE_VIOLATION)) {
        throw new ConflictException(
          'この slug は既にこのプロジェクトで使われています。別の slug を指定してください。',
        );
      }
      throw err;
    }
  }

  /**
   * 公開 API(sitemap 生成用):全テナント横断で公開済 BlogPost を列挙する(ADR-014 §3 / F10)。
   *
   * - `publishedAt = null`(下書き)は除外
   * - 内部フィールド(`tenantId` / `body` 等)は `select` で除外、URL 組立に必要な最小情報のみ返す
   * - 件数上限は当面なし(運用初期の規模を想定)。爆発時は LIMIT を追加する。
   */
  async listPublic() {
    return this.prisma.blogPost.findMany({
      where: { publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      select: {
        slug: true,
        projectId: true,
        publishedAt: true,
        tenant: { select: { slug: true } },
      },
    });
  }

  /**
   * 公開 API:tenant slug + projectId + postSlug で公開済 BlogPost を取得する(ADR-014 §3)。
   *
   * - `publishedAt = null`(下書き)は 404 で弁別しない(公開していない記事の存在を漏らさない)
   * - 内部フィールド(`tenantId` / `deliveryId` / `updatedAt` 等)は `select` で除外
   * - 親 Project の名前 / id と Tenant の slug を OG メタ用に同時取得
   */
  async findPublic(slug: string, projectId: string, postSlug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: {
        slug: postSlug,
        projectId,
        publishedAt: { not: null },
        tenant: { slug },
      },
      select: {
        title: true,
        body: true,
        publishedAt: true,
        slug: true,
        project: { select: { name: true, id: true } },
        tenant: { select: { slug: true } },
      },
    });
    if (!post) {
      throw new NotFoundException('指定された記事が見つかりません。');
    }
    return post;
  }
}
