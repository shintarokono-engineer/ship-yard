import { randomBytes } from 'crypto';

import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';

import { Plan, Role } from '@shipyard/db';

import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateWorkspaceDto } from './dto/create-workspace.dto';

/** 自動 slug 生成時の衝突回避ループの最大試行回数(現実的にはほぼ 1〜2 回で収まる)。 */
const SLUG_GENERATION_MAX_ATTEMPTS = 50;

/** name が全て非 ASCII で slug 化結果が空になった場合のフォールバック先頭(`workspace-<random>`)。 */
const FALLBACK_SLUG_PREFIX = 'workspace';

/** フォールバック slug 末尾のランダムバイト数(base64url で 6 文字、衝突確率は無視できる)。 */
const FALLBACK_SLUG_RANDOM_BYTES = 4;

export interface CreateWorkspaceResult {
  tenant: {
    id: string;
    slug: string;
    name: string;
    plan: Plan;
    role: Role;
  };
  /** Stripe Customer + Subscription 行の初期化に成功したか(失敗時は Checkout 時に lazy 作成される)。 */
  subscriptionInitialized: boolean;
}

/** `GET /workspaces`(自分の所属一覧)のレスポンス 1 件分。 */
export interface MyWorkspaceListItem {
  id: string;
  slug: string;
  name: string;
  plan: Plan;
  role: Role;
  /** TenantMember.joinedAt(自分が加入した日時、ISO8601)。 */
  joinedAt: string;
}

/**
 * ワークスペース(= テナント)の新規作成ロジック。
 *
 * 手順:
 * 1. Clerk ユーザー ID から DB の User を解決(未登録 = 403、Clerk Webhook 未受信ケース)
 * 2. slug を決定(DTO 指定 or `name` から自動生成、衝突時はサフィックスで一意化)
 * 3. `$transaction` で `Tenant` + `TenantMember(role=OWNER)` を原子的に INSERT(両方 DB クエリのみ)
 * 4. トランザクション外で `BillingService.initializeProTrialSubscription` を呼んで Stripe Customer +
 *    7 日 Pro トライアル Subscription を作成(ADR-012)。
 *    - 成功時:`Tenant.plan = PRO` に更新され、レスポンスもそれを反映
 *    - 失敗時:ベストエフォート(`Tenant.plan = FREE` のまま、次回 Checkout で lazy 作成)
 *
 * 認可:
 * - 認証済み Clerk ユーザーなら誰でも作成可能(1 ユーザー = 何個でも所有可)
 * - ロール検証なし(新規作成なのでまだ workspace 所属がない)
 */
@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  async create(clerkUserId: string, dto: CreateWorkspaceDto): Promise<CreateWorkspaceResult> {
    const user = await this.prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      // Clerk JWT は通っているが User テーブルに同期されていないケース(Clerk Webhook 未受信等)
      throw new ForbiddenException('User not registered in Shipyard');
    }

    const slug = dto.slug
      ? await this.requireSlugAvailable(dto.slug)
      : await this.generateUniqueSlug(dto.name);

    // Tenant + TenantMember(OWNER)を原子化(両方 DB クエリのみ、外部 I/O なし)
    const tenant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          slug,
          name: dto.name,
          ownerId: user.id,
          plan: Plan.FREE,
        },
        select: { id: true, slug: true, name: true, plan: true },
      });
      await tx.tenantMember.create({
        data: {
          tenantId: created.id,
          userId: user.id,
          role: Role.OWNER,
        },
      });
      return created;
    });

    // Stripe Customer + 7 日 Pro トライアル Subscription を初期化(ADR-012)。
    // 失敗してもベストエフォート(Tenant.plan は FREE のまま、UI から手動アップグレードで復旧可能)。
    const subscriptionInitialized = await this.billing.initializeProTrialSubscription({
      id: tenant.id,
      name: tenant.name,
      owner: { email: user.email, name: user.name },
    });

    // トライアル付与に成功している場合は Tenant.plan が PRO に更新されているため、レスポンスでも最新値を返す。
    const finalPlan = subscriptionInitialized ? Plan.PRO : tenant.plan;

    return {
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        plan: finalPlan,
        role: Role.OWNER,
      },
      subscriptionInitialized,
    };
  }

  /**
   * 現在ユーザーが所属するすべてのワークスペースを返す。
   *
   * - Clerk JWT は通っているが `User` 行が未同期の場合は空配列を返す
   *   (オンボーディング前提のフローで、403 にすると UI 遷移が複雑になるため)
   * - tenantMember は `userId` で限定するので、tenantId 注入は不要(横断検索が必要)
   * - joinedAt 昇順:最初に入った workspace が先頭、ホーム redirect 先として直感的
   */
  async listMine(clerkUserId: string): Promise<MyWorkspaceListItem[]> {
    const user = await this.prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true },
    });
    if (!user) return [];

    const members = await this.prisma.tenantMember.findMany({
      where: { userId: user.id },
      select: {
        role: true,
        joinedAt: true,
        tenant: {
          select: { id: true, slug: true, name: true, plan: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return members.map((m) => ({
      id: m.tenant.id,
      slug: m.tenant.slug,
      name: m.tenant.name,
      plan: m.tenant.plan,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }));
  }

  /** ユーザー指定 slug の重複確認。既存があれば 409。 */
  private async requireSlugAvailable(slug: string): Promise<string> {
    const exists = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException(`Workspace slug "${slug}" is already taken.`);
    }
    return slug;
  }

  /**
   * `name` から URL safe な slug を生成し、衝突するなら `-2`, `-3`, ... と数値サフィックスで一意化する。
   * 全文字が ASCII 外などで slug 化結果が空文字になる場合は `workspace-<random>` にフォールバックする。
   */
  private async generateUniqueSlug(name: string): Promise<string> {
    const base =
      slugify(name) ||
      `${FALLBACK_SLUG_PREFIX}-${randomBytes(FALLBACK_SLUG_RANDOM_BYTES).toString('base64url').toLowerCase()}`;

    // base, base-2, base-3, ... の順で空きを探す
    for (let attempt = 1; attempt <= SLUG_GENERATION_MAX_ATTEMPTS; attempt++) {
      const candidate = attempt === 1 ? base : `${base}-${attempt}`;
      const exists = await this.prisma.tenant.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
    }

    // 50 回試して全て衝突は通常ありえない(同名 50 個のワークスペース)。ランダム末尾で確実に避ける。
    const fallback = `${base}-${randomBytes(FALLBACK_SLUG_RANDOM_BYTES).toString('base64url').toLowerCase()}`;
    this.logger.warn(
      `Slug generation exhausted ${SLUG_GENERATION_MAX_ATTEMPTS} attempts for base "${base}"; falling back to "${fallback}"`,
    );
    return fallback;
  }
}

/**
 * 人間向け表示名から URL safe な slug を生成する純関数。
 * - 小文字化、英数字と空白・ハイフン以外を除去、空白をハイフン化、連続ハイフンを 1 つに、30 文字で切り詰め
 * - 結果が空文字になりうる(日本語のみ等)→ 呼び出し側でフォールバック処理
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}
