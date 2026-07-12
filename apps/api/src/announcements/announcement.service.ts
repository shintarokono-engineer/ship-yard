import { Injectable, NotFoundException } from '@nestjs/common';

import {
  AnnouncementStatus,
  DeliveryChannel,
  DeliveryStatus,
  Feature,
  Prisma,
  type Plan,
} from '@shipyard/db';

import { AIUsageService } from '../ai/ai-usage.service';
import { dayjs } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
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
    private readonly projects: ProjectsService,
  ) {}

  /** Announcement を新規作成する(status = DRAFT、Delivery 0 件)。 */
  async create(
    tenantId: string,
    projectId: string,
    userId: string,
    dto: CreateAnnouncementDto,
  ) {
    // projectId が当該テナントに属することを検証(FK は Project.id 単独参照のため、
    // 検証なしだと他テナントの projectId を指す行を作成できてしまう。checklist.service と同じ規律)。
    await this.projects.assertExists(tenantId, projectId);
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
    // グローバルクレジット上限(ADR-012)+ 本機能固有の月次回数上限の両方を AI 呼び出し前に確認する
    // (landing-page / diagnosis 等と対称にする)。
    await this.aiUsage.assertWithinPlanCredits({ id: args.tenantId, plan: args.plan });
    await this.aiUsage.assertWithinAnnouncementQuota({
      id: args.tenantId,
      plan: args.plan,
    });

    const announcement = await this.getDetail(args.tenantId, args.projectId, args.id);
    const project = await this.prisma.project.findFirst({
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
    if (!project) {
      // Prisma の P2025 を素通しすると global filter 不在のため 500 になる。明示的に 404 を返す。
      throw new NotFoundException('プロジェクトが見つかりません。');
    }

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
   * Delivery 実行(ADR-014 §3、MVP)。
   * - TWITTER: Web Intent で X の投稿画面を FE が開き、ユーザーの「送信完了」で SENT マーク
   * - BLOG: BlogPost.publishedAt をセットして公開
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

    // 既に送信済みなら no-op(二重クリックで sentAt / publishedAt が上書きされ続けるのを防ぐ)。
    if (delivery.status === DeliveryStatus.SENT) {
      return this.getDetail(args.tenantId, args.projectId, args.announcementId);
    }

    if (delivery.channel === DeliveryChannel.TWITTER) {
      // ADR-014(MVP)は Web Intent 方式:BE は X API を叩かず、FE で X の投稿画面が開かれた前提で
      // ユーザーの「送信完了」ボタンを起点に SENT マークするだけ。externalRef は tweet id を取得できない。
      await this.prisma.delivery.update({
        where: { id: delivery.id, tenantId: args.tenantId },
        data: {
          status: DeliveryStatus.SENT,
          sentAt: dayjs.utc().toDate(),
          externalRef: null,
          executedById: args.userId,
          error: null,
        },
      });
    } else if (delivery.channel === DeliveryChannel.BLOG) {
      const content = delivery.content as unknown as BlogDeliveryContent;
      // Json 型から取り出した blogPostId は型レベルで信頼できないため、
      // 文字列であることを明示的に確認した上で tenantId 境界付きで UPDATE する
      // (implementation-rules.md「全クエリで tenantId を明示注入」)。
      if (typeof content?.blogPostId !== 'string') {
        throw new NotFoundException('Blog 配信の内容が不正です。再生成してください。');
      }
      const post = await this.prisma.blogPost.update({
        where: { id: content.blogPostId, tenantId: args.tenantId },
        data: { publishedAt: dayjs.utc().toDate() },
      });
      await this.prisma.delivery.update({
        where: { id: delivery.id, tenantId: args.tenantId },
        data: {
          status: DeliveryStatus.SENT,
          sentAt: dayjs.utc().toDate(),
          externalRef: post.id,
          executedById: args.userId,
          error: null,
        },
      });
    }

    // 全 Delivery が SENT なら Announcement.status = DONE、それ以外なら EXECUTING。
    // tenantId を明示注入(getDetail で検証済の id だが、リファクタ耐性のためルール準拠)。
    const refreshed = await this.prisma.announcement.findFirstOrThrow({
      where: { id: args.announcementId, tenantId: args.tenantId },
      include: { deliveries: { select: { status: true } } },
    });
    const allSent =
      refreshed.deliveries.length > 0 &&
      refreshed.deliveries.every((d) => d.status === DeliveryStatus.SENT);
    await this.prisma.announcement.update({
      where: { id: args.announcementId, tenantId: args.tenantId },
      data: {
        status: allSent ? AnnouncementStatus.DONE : AnnouncementStatus.EXECUTING,
      },
    });

    return this.getDetail(args.tenantId, args.projectId, args.announcementId);
  }

  /**
   * slug 候補が重複していたら `-2`, `-3`, ... `-49` を順に試す。48 候補すべて埋まっていたら timestamp 付与。
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
    // i = 2..49 で計 48 候補(base + `-2` ... `-49`)を試行。
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

/**
 * title を kebab-case slug に変換(ADR-014)。ASCII 英数字 + ハイフンのみ許容
 * (update-blog-post DTO の pattern `^[a-z0-9]+(?:-[a-z0-9]+)*$` と同期)。
 * 非 ASCII のみの title は空文字になり、呼び出し側の `|| 'post'` fallback + `findUniqueBlogSlug`
 * で `post`, `post-2`, ... と自動連番される。
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
