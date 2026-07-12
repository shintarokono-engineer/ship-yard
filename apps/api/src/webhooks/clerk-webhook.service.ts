import { Injectable, Logger } from '@nestjs/common';
import type { WebhookEvent } from '@clerk/backend';

import { type Prisma, Role, WebhookStatus } from '@shipyard/db';

import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Clerk Webhook イベントの処理本体(§9.10 Clerk webhook、Day 49)。
 *
 * - Idempotency: `ClerkWebhookEvent.svixMessageId`(`svix-id` ヘッダー値、ユニーク制約)で重複配信を吸収する。
 *   既に PROCESSED 済みのイベントは何もしない。
 * - 処理中に例外が出たら FAILED を記録して re-throw → Clerk が指数バックオフで再送する。
 * - イベント種別ごとの処理は handle() で `User` モデルの upsert / 論理削除に委譲する。
 *
 * 注: `ClerkWebhookEvent` はテナントを持たない例外モデル(User は Tenant に属さないため)。
 * Stripe 用 `WebhookEvent` とは Idempotency Key の形式(Stripe = `event.id` / Clerk = `svix-id`)が
 * 異なるため、責務を分離して別テーブルにしている。
 */
@Injectable()
export class ClerkWebhookService {
  private readonly logger = new Logger(ClerkWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /** 検証済みの Clerk Webhook イベントを処理する(冪等)。 */
  async process(event: WebhookEvent, svixMessageId: string): Promise<void> {
    const already = await this.prisma.clerkWebhookEvent.findUnique({
      where: { svixMessageId },
      select: { status: true },
    });
    if (already?.status === WebhookStatus.PROCESSED) {
      this.logger.log(`Duplicate Clerk delivery, skipping: ${svixMessageId} (${event.type})`);
      return;
    }

    // JSON 化は `WebhookEvent` 内部の Date / undefined を JSON-serializable に正規化する目的
    // (undefined は欠落、関数は除去される。監査ログとしての可逆性は不要なため許容)。
    const payload = JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue;
    try {
      await this.handle(event);
      // FAILED → 再配信時に最新の payload で上書きするため update 節にも payload を含める
      // (監査ログとして最新ペイロードが残るほうが調査に役立つため)。
      await this.prisma.clerkWebhookEvent.upsert({
        where: { svixMessageId },
        create: {
          svixMessageId,
          type: event.type,
          payload,
          status: WebhookStatus.PROCESSED,
        },
        update: {
          status: WebhookStatus.PROCESSED,
          processedAt: new Date(),
          payload,
          type: event.type,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to process Clerk event ${svixMessageId} (${event.type})`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.prisma.clerkWebhookEvent.upsert({
        where: { svixMessageId },
        create: {
          svixMessageId,
          type: event.type,
          payload,
          status: WebhookStatus.FAILED,
        },
        update: { status: WebhookStatus.FAILED, payload, type: event.type },
      });
      throw err;
    }
  }

  /**
   * イベント種別ごとの処理。
   *
   * - `user.created` / `user.updated`: `clerkUserId` をキーに `User` を upsert
   *   (Clerk → Shipyard DB へのミラー。更新時は `deletedAt` を null に戻し、再アクティブ化も兼ねる)
   * - `user.deleted`: 論理削除。`TenantMember` / `Project` 等の既存リレーションを破壊しないため
   *   物理削除はせず `deletedAt` をセットする(レコードが既に無ければ no-op)
   * - その他: ログのみ(将来 `session.*` や `organization.*` を扱う余地を残す)
   */
  private async handle(event: WebhookEvent): Promise<void> {
    switch (event.type) {
      case 'user.created':
      case 'user.updated':
        await this.upsertUser(event.data);
        break;
      case 'user.deleted':
        await this.softDeleteUser(event.data);
        break;
      default:
        this.logger.debug(`Unhandled Clerk event type: ${event.type}`);
    }
  }

  /** `user.created` / `user.updated` ペイロードから `User` を upsert。 */
  private async upsertUser(data: UserWebhookData): Promise<void> {
    const clerkUserId = data.id;
    if (!clerkUserId) {
      throw new Error('Clerk user webhook payload missing data.id');
    }

    const email = extractPrimaryEmail(data);
    if (!email) {
      // Clerk の SMS-only 認証等 email が無い構成だと毎回ここに来て再送ループになる。
      // throw せず warn + skip にし、`ClerkWebhookEvent` 側は PROCESSED 扱いで終わらせる
      // (運用上、Shipyard では email 必須のため Clerk 側設定で email を必須化する前提)。
      this.logger.warn(
        `Clerk user ${clerkUserId} has no primary email address; skipping upsert`,
      );
      return;
    }

    const name = composeName(data);
    const image = sanitizeImageUrl(data.image_url ?? data.profile_image_url ?? null);

    await this.prisma.user.upsert({
      where: { clerkUserId },
      create: {
        clerkUserId,
        email,
        name,
        image,
      },
      update: {
        email,
        name,
        image,
        // user.deleted → 再作成のケースに備え、論理削除フラグを必ずクリアする
        deletedAt: null,
      },
    });
  }

  /**
   * `user.deleted` を論理削除に変換。レコード未存在は no-op。
   *
   * 併せて、削除ユーザーの `TenantMember`(非 OWNER)を撤去し、影響テナントの Stripe seat 数を
   * 同期する(`MembersService.remove` と同じ Saga)。これをやらないと Clerk 側で消えたアカウント分も
   * メンバー一覧に残り続け、座席課金され続ける。
   * OWNER の membership は `Tenant.ownerId` 不変条件を壊すため撤去せず、要手動対応として error ログを残す
   * (所有権譲渡 API 実装までの暫定。物理削除しないことでテナントの orphan 化を防ぐ)。
   */
  private async softDeleteUser(data: DeletedUserWebhookData): Promise<void> {
    const clerkUserId = data.id;
    if (!clerkUserId) {
      this.logger.warn('Clerk user.deleted payload missing data.id; skipping');
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true },
    });

    await this.prisma.user.updateMany({
      where: { clerkUserId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (!user) return;

    const memberships = await this.prisma.tenantMember.findMany({
      where: { userId: user.id },
      select: { tenantId: true, role: true },
    });

    const removableTenantIds: string[] = [];
    for (const m of memberships) {
      if (m.role === Role.OWNER) {
        this.logger.error(
          `Deleted Clerk user ${clerkUserId} is OWNER of tenant ${m.tenantId}; ` +
            `membership left intact (ownership transfer required). Manual intervention needed.`,
        );
        continue;
      }
      removableTenantIds.push(m.tenantId);
    }

    if (removableTenantIds.length === 0) return;

    await this.prisma.tenantMember.deleteMany({
      where: { userId: user.id, role: { not: Role.OWNER } },
    });

    // ADR-012 第 1 層 Saga:DB commit 後に影響テナントの Stripe Subscription Quantity を同期。
    // 失敗しても Webhook 自体は成功扱いにする(第 3 層 reconciliation バッチが翌日補正、v1.x)。
    for (const tenantId of removableTenantIds) {
      try {
        await this.billing.syncSubscriptionQuantity(tenantId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(
          `Stripe seat sync failed after Clerk user delete (tenant=${tenantId}): ${msg}`,
        );
      }
    }
  }
}

/**
 * Clerk Webhook ペイロード `data` の型(`user.created` / `user.updated` 共通)。
 * `@clerk/backend` の `WebhookEvent` から narrowing しても良いが、必要なフィールドだけ
 * 明示するほうが Service の入力契約として読みやすい。
 */
interface UserWebhookData {
  id?: string;
  email_addresses?: Array<{ id: string; email_address: string }>;
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  profile_image_url?: string | null;
}

/** `user.deleted` ペイロード `data` の型。Clerk は `id` のみ送信してくる場合がある。 */
interface DeletedUserWebhookData {
  id?: string;
  deleted?: boolean;
}

/** primary_email_address_id にマッチするものを優先、なければ先頭を採用。 */
function extractPrimaryEmail(data: UserWebhookData): string | null {
  const addresses = data.email_addresses ?? [];
  const fallback = addresses[0];
  if (!fallback) return null;
  const primary = data.primary_email_address_id
    ? addresses.find((a) => a.id === data.primary_email_address_id)
    : undefined;
  return (primary ?? fallback).email_address ?? null;
}

/** first / last name から表示名を組み立てる。両方 null の場合は null。 */
function composeName(data: UserWebhookData): string | null {
  const parts = [data.first_name, data.last_name].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * `image_url` を `User.image` に保存する前に http(s) スキームに限定する。
 * Webhook ペイロードは Clerk 側で生成されるため理論上は信頼できるが、Defense in Depth として
 * `javascript:` / `data:` などのスキームを弾く(ADR-009 `safeHref` パターン踏襲)。
 */
function sanitizeImageUrl(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}
