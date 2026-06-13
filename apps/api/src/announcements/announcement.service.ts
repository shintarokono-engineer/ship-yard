import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import {
  AnnouncementStatus,
  DeliveryChannel,
  DeliveryStatus,
  Feature,
  Prisma,
  type Plan,
} from '@shipyard/db';

import { AIUsageService } from '../ai/ai-usage.service';
import {
  TwitterApiError,
  TwitterClientService,
} from '../integrations/twitter/twitter-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnnouncementGenService } from './announcement-gen.service';
import { ANNOUNCEMENT_CHANNELS } from './announcement-types';
import type {
  BlogDeliveryContent,
  TwitterDeliveryContent,
} from './announcement-types';
import type { CreateAnnouncementDto } from './dto/create-announcement.dto';
import type { GenerateAnnouncementDto } from './dto/generate-announcement.dto';
import type { UpdateAnnouncementDto } from './dto/update-announcement.dto';

/** Prisma JSON 型へ Delivery.content を安全に入れるためのヘルパー。 */
function toJson(value: TwitterDeliveryContent | BlogDeliveryContent): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

/**
 * Announcement(ADR-014)の CRUD + AI 生成 + 配信実行を担う Service。
 *
 * - 永続化は本サービスに集約(`AnnouncementGenService` は AI ドラフト生成のみを返す責務分離)
 * - tenant 境界の絞り込みは全クエリで `tenantId` を明示注入(implementation-rules.md「テナント解決」)
 * - 配信実行は MVP では同期即時(v1.x で BullMQ 投入時に本サービスから enqueue に置き換え)
 */
@Injectable()
export class AnnouncementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiUsage: AIUsageService,
    private readonly gen: AnnouncementGenService,
    private readonly twitterClient: TwitterClientService,
  ) {}

  /** Announcement を新規作成する(status = DRAFT、Delivery 0 件)。 */
  async create(
    tenantId: string,
    projectId: string,
    userId: string,
    dto: CreateAnnouncementDto,
  ) {
    return this.prisma.announcement.create({
      data: {
        tenantId,
        projectId,
        title: dto.title,
        createdById: userId,
        status: AnnouncementStatus.DRAFT,
      },
    });
  }

  /** 一覧(プロジェクト配下、新しい順)。各 Delivery の channel + status のみ含める。 */
  async list(tenantId: string, projectId: string) {
    const items = await this.prisma.announcement.findMany({
      where: { tenantId, projectId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        deliveries: { select: { channel: true, status: true } },
      },
    });
    return { items };
  }

  /** 詳細(Delivery 全件含む)。未存在は 404。 */
  async getDetail(tenantId: string, projectId: string, id: string) {
    const item = await this.prisma.announcement.findFirst({
      where: { id, tenantId, projectId },
      include: { deliveries: { orderBy: { channel: 'asc' } } },
    });
    if (!item) {
      throw new NotFoundException('指定された告知が見つかりません。');
    }
    return item;
  }

  /**
   * Announcement の更新(タイトル / Twitter Delivery 直接編集)。
   * Blog Delivery は `PATCH /blog-posts/:id` 経由のため本メソッドでは扱わない。
   */
  async update(
    tenantId: string,
    projectId: string,
    id: string,
    dto: UpdateAnnouncementDto,
  ) {
    const existing = await this.getDetail(tenantId, projectId, id);
    await this.prisma.$transaction(async (tx) => {
      if (dto.title !== undefined) {
        await tx.announcement.update({
          where: { id: existing.id },
          data: { title: dto.title },
        });
      }
      if (dto.twitterContent) {
        const twitter = existing.deliveries.find(
          (d) => d.channel === DeliveryChannel.TWITTER,
        );
        if (twitter) {
          const payload: TwitterDeliveryContent = { text: dto.twitterContent.text };
          await tx.delivery.update({
            where: { id: twitter.id },
            data: { content: toJson(payload) },
          });
        }
      }
    });
    return this.getDetail(tenantId, projectId, id);
  }

  /** Announcement を削除(Delivery / BlogPost のリンクは schema の onDelete で連鎖)。 */
  async delete(tenantId: string, projectId: string, id: string) {
    const existing = await this.getDetail(tenantId, projectId, id);
    await this.prisma.announcement.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  /**
   * Sonnet 4 + Tool Use で多チャネル文面を生成して Delivery.content にセット(ADR-014 §2)。
   *
   * - tenant.plan に応じて quota チェック(`assertWithinAnnouncementQuota`)
   * - 既存 Delivery を upsert で上書き(履歴は持たない、最新が真実)
   * - 部分再生成(channels 指定)も Tool Use 1 回固定(不要 channel は書かない)
   * - BlogPost.slug は title から派生、重複時はサフィックス付与
   * - 成功時 Announcement.status = READY、失敗時は AIBadResponseError を上位に伝播
   */
  async generate(args: {
    tenantId: string;
    projectId: string;
    id: string;
    userId: string;
    plan: Plan;
    dto: GenerateAnnouncementDto;
  }) {
    await this.aiUsage.assertWithinAnnouncementQuota({
      id: args.tenantId,
      plan: args.plan,
    });

    const announcement = await this.getDetail(args.tenantId, args.projectId, args.id);
    const project = await this.prisma.project.findFirstOrThrow({
      where: { id: args.projectId, tenantId: args.tenantId },
      select: {
        name: true,
        description: true,
        categoryDomain: true,
        pricingTier: true,
        targetUsers: true,
        problemStatement: true,
        proposedFeatures: true,
        pricingModel: true,
      },
    });

    // 最新 LP の hero(参考トーン)
    const lp = await this.prisma.landingPage.findFirst({
      where: { projectId: args.projectId, tenantId: args.tenantId },
      select: { blocks: true },
    });
    const heroRaw = Array.isArray(lp?.blocks)
      ? (lp!.blocks as Array<{ type: string; heading?: string; sub?: string }>).find(
          (b) => b && typeof b === 'object' && b.type === 'hero',
        )
      : undefined;
    const latestLpHero = heroRaw?.heading
      ? { heading: heroRaw.heading, sub: heroRaw.sub }
      : undefined;

    // 最新 README 抜粋(参考機能)
    const readme = await this.prisma.projectDocument.findFirst({
      where: {
        projectId: args.projectId,
        tenantId: args.tenantId,
        type: 'README',
        deletedAt: null,
      },
      orderBy: { version: 'desc' },
      select: { content: true },
    });

    const generated = await this.gen.generate({
      topic: args.dto.topic,
      project,
      announcementTitle: announcement.title,
      channels: args.dto.channels,
      latestLpHero,
      latestReadmeExcerpt: readme?.content?.slice(0, 300),
    });

    const channelsToWrite =
      args.dto.channels && args.dto.channels.length > 0
        ? args.dto.channels
        : ANNOUNCEMENT_CHANNELS;

    // Blog Delivery を扱う場合に備えて、トランザクション外で slug 候補を解決する
    // (extended PrismaClient と tx の型が異なるため。@@unique 違反は最終的に DB が守る)。
    const baseSlugForBlog = channelsToWrite.includes(DeliveryChannel.BLOG)
      ? slugify(generated.drafts.blog.title)
      : '';
    const existingBlogDelivery = announcement.deliveries.find(
      (d) => d.channel === DeliveryChannel.BLOG,
    );
    const resolvedBlogSlug =
      channelsToWrite.includes(DeliveryChannel.BLOG) && !existingBlogDelivery
        ? await this.findUniqueBlogSlug(args.tenantId, args.projectId, baseSlugForBlog)
        : null;

    await this.prisma.$transaction(async (tx) => {
      // Twitter Delivery を upsert
      if (channelsToWrite.includes(DeliveryChannel.TWITTER)) {
        const twitterPayload: TwitterDeliveryContent = {
          text: generated.drafts.twitter.text,
        };
        await tx.delivery.upsert({
          where: {
            announcementId_channel: {
              announcementId: args.id,
              channel: DeliveryChannel.TWITTER,
            },
          },
          create: {
            tenantId: args.tenantId,
            announcementId: args.id,
            channel: DeliveryChannel.TWITTER,
            status: DeliveryStatus.DRAFT,
            content: toJson(twitterPayload),
          },
          update: {
            content: toJson(twitterPayload),
            status: DeliveryStatus.DRAFT,
          },
        });
      }

      // Blog Delivery + BlogPost を upsert(slug は title から派生、重複時はサフィックス)
      if (channelsToWrite.includes(DeliveryChannel.BLOG)) {
        const existingPost = existingBlogDelivery
          ? await tx.blogPost.findUnique({
              where: { deliveryId: existingBlogDelivery.id },
            })
          : null;
        const post = existingPost
          ? await tx.blogPost.update({
              where: { id: existingPost.id },
              data: {
                title: generated.drafts.blog.title,
                body: generated.drafts.blog.body,
                // slug はユーザー編集を尊重するため再生成では更新しない
              },
            })
          : await tx.blogPost.create({
              data: {
                tenantId: args.tenantId,
                projectId: args.projectId,
                slug: resolvedBlogSlug ?? (slugify(generated.drafts.blog.title) || 'post'),
                title: generated.drafts.blog.title,
                body: generated.drafts.blog.body,
              },
            });

        const blogPayload: BlogDeliveryContent = {
          blogPostId: post.id,
          summary: generated.drafts.blog.summary,
        };
        await tx.delivery.upsert({
          where: {
            announcementId_channel: {
              announcementId: args.id,
              channel: DeliveryChannel.BLOG,
            },
          },
          create: {
            tenantId: args.tenantId,
            announcementId: args.id,
            channel: DeliveryChannel.BLOG,
            status: DeliveryStatus.DRAFT,
            content: toJson(blogPayload),
          },
          update: {
            content: toJson(blogPayload),
            status: DeliveryStatus.DRAFT,
          },
        });

        // BlogPost と Delivery を `deliveryId` で紐付け(初回 create のときに必要)
        await tx.blogPost.update({
          where: { id: post.id },
          data: {
            delivery: {
              connect: {
                announcementId_channel: {
                  announcementId: args.id,
                  channel: DeliveryChannel.BLOG,
                },
              },
            },
          },
        });
      }

      await tx.announcement.update({
        where: { id: args.id },
        data: { status: AnnouncementStatus.READY },
      });
    });

    await this.aiUsage.record({
      tenantId: args.tenantId,
      userId: args.userId,
      model: generated.model,
      feature: Feature.ANNOUNCEMENT_GEN,
      tokensIn: generated.tokensIn,
      tokensOut: generated.tokensOut,
    });

    return this.getDetail(args.tenantId, args.projectId, args.id);
  }

  /**
   * Delivery 実行(MVP は同期即時)。Twitter = POST tweet / Blog = publishedAt セット(ADR-014 §3)。
   * 失敗時は Delivery.status = FAILED + error にユーザー向け文言を保存し、上位に例外を再 throw。
   */
  async executeDelivery(args: {
    tenantId: string;
    projectId: string;
    announcementId: string;
    deliveryId: string;
    userId: string;
  }) {
    const announcement = await this.getDetail(
      args.tenantId,
      args.projectId,
      args.announcementId,
    );
    const delivery = announcement.deliveries.find((d) => d.id === args.deliveryId);
    if (!delivery) {
      throw new NotFoundException('指定された配信が見つかりません。');
    }

    if (delivery.channel === DeliveryChannel.TWITTER) {
      const content = delivery.content as unknown as TwitterDeliveryContent;
      const account = await this.prisma.twitterAccount.findFirst({
        where: { tenantId: args.tenantId },
        orderBy: { createdAt: 'asc' },
      });
      if (!account) {
        await this.prisma.delivery.update({
          where: { id: delivery.id },
          data: {
            status: DeliveryStatus.FAILED,
            error: 'X アカウントが連携されていません。設定画面から連携してください。',
          },
        });
        throw new ForbiddenException('X アカウントが連携されていません。');
      }
      try {
        const result = await this.twitterClient.postTweet(account, content.text);
        await this.prisma.delivery.update({
          where: { id: delivery.id },
          data: {
            status: DeliveryStatus.SENT,
            sentAt: new Date(),
            externalRef: result.tweetId,
            executedById: args.userId,
            error: null,
          },
        });
      } catch (err) {
        const message =
          err instanceof TwitterApiError
            ? err.userMessage
            : 'X 投稿で予期しないエラーが発生しました。';
        await this.prisma.delivery.update({
          where: { id: delivery.id },
          data: {
            status: DeliveryStatus.FAILED,
            error: message,
            executedById: args.userId,
          },
        });
        throw err;
      }
    } else if (delivery.channel === DeliveryChannel.BLOG) {
      const content = delivery.content as unknown as BlogDeliveryContent;
      const post = await this.prisma.blogPost.update({
        where: { id: content.blogPostId },
        data: { publishedAt: new Date() },
      });
      await this.prisma.delivery.update({
        where: { id: delivery.id },
        data: {
          status: DeliveryStatus.SENT,
          sentAt: new Date(),
          externalRef: post.id,
          executedById: args.userId,
          error: null,
        },
      });
    }

    // 全 Delivery が SENT なら Announcement.status = DONE、それ以外なら EXECUTING
    const refreshed = await this.prisma.announcement.findFirstOrThrow({
      where: { id: args.announcementId },
      include: { deliveries: { select: { status: true } } },
    });
    const allSent =
      refreshed.deliveries.length > 0 &&
      refreshed.deliveries.every((d) => d.status === DeliveryStatus.SENT);
    await this.prisma.announcement.update({
      where: { id: args.announcementId },
      data: {
        status: allSent ? AnnouncementStatus.DONE : AnnouncementStatus.EXECUTING,
      },
    });

    return this.getDetail(args.tenantId, args.projectId, args.announcementId);
  }

  /**
   * slug 候補が重複していたら `-2`, `-3` ... を試す。50 個試して埋まっていたら timestamp 付与。
   *
   * トランザクション開始前に呼び出す前提(extended PrismaClient と tx callback の型が異なるため、
   * `this.prisma` を直接使う)。@@unique([tenantId, projectId, slug]) が最終ガードなので、
   * 競合発生時は Prisma 側で UNIQUE_VIOLATION が出る稀ケースとして許容する。
   */
  private async findUniqueBlogSlug(
    tenantId: string,
    projectId: string,
    base: string,
  ): Promise<string> {
    const safeBase = base || 'post';
    let candidate = safeBase;
    for (let i = 2; i < 50; i++) {
      const existing = await this.prisma.blogPost.findFirst({
        where: { tenantId, projectId, slug: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
      candidate = `${safeBase}-${i}`;
    }
    return `${safeBase}-${Date.now().toString(36)}`;
  }
}

/** title を kebab-case slug に変換(BlogPost.slug の自動生成、ADR-014)。 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
