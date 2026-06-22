import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { isPrismaError, PrismaErrorCode } from '@shipyard/db';

import { dayjs } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateBlogPostDto } from './dto/update-blog-post.dto';

/**
 * sitemap 用 `listPublic()` の最大返却件数(F10、ADR-014)。
 *
 * sitemap.xml プロトコルの 50,000 件上限を踏まえつつ、運用初期の現実値として 5,000 を採用。
 * 5,000 件は 1 テナント = 平均 10 記事公開で 500 テナントの規模を想定。これを超えるなら
 * sitemap index に分割するなどの構造変更を検討する(本定数を緩めるのは応急対応)。
 */
const PUBLIC_BLOG_POST_LIST_LIMIT = 5000;

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
   * - `take: PUBLIC_BLOG_POST_LIST_LIMIT` で DoS 対策(上限を超えたら sitemap index 化を検討)
   */
  async listPublic() {
    return this.prisma.blogPost.findMany({
      where: { publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      take: PUBLIC_BLOG_POST_LIST_LIMIT,
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
