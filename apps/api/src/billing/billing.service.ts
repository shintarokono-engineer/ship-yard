import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Plan, SubStatus } from '@shipyard/db';

import { dayjs } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { type PaidPlan, StripeService } from '../stripe/stripe.service';
import type { Stripe } from '../stripe/stripe.types';

/** Checkout / Subscription の metadata に載せるテナント識別キー(Webhook 側で読み取る) */
const META_TENANT_ID = 'tenantId';

/**
 * Stripe ↔ DB(Subscription / Tenant.plan)の同期ロジック(ADR-004)。
 *
 * - Checkout Session の作成と、その前提となる Stripe Customer / Subscription 行の確保
 * - Webhook で受け取った Stripe オブジェクトを DB に反映
 *
 * `Subscription` / `Tenant` は tenantId 自動注入の対象外モデルなので、tenantId は明示的に扱う。
 * Webhook 受信時は ALS のテナントコンテキストが無いので、tenantId は Stripe metadata(or 既存行)から解決する。
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Checkout(apps/web からの「アップグレード」操作で呼ばれる)
  // ---------------------------------------------------------------------------

  /**
   * テナントに対応する Stripe Customer と Subscription 行を必ず存在させ、stripeCustomerId を返す。
   * Free プランでも Customer は先に作っておく(後の課金切替を高速化、schema コメント参照)。
   */
  private async ensureStripeCustomer(tenant: {
    id: string;
    name: string;
    owner: { email: string; name: string | null };
  }): Promise<string> {
    const existing = await this.prisma.subscription.findUnique({
      where: { tenantId: tenant.id },
      select: { stripeCustomerId: true },
    });
    if (existing) {
      return existing.stripeCustomerId;
    }

    // 【Stripe API 呼び出し】Customer(= Shipyard のワークスペース 1 個)を Stripe 側に作成する。
    // email/name は表示用にオーナーの値を入れる。metadata.tenantId を持たせて Webhook 側から逆引きできるようにする。
    const customer = await this.stripe.client.customers.create({
      email: tenant.owner.email,
      name: tenant.owner.name ?? tenant.name,
      metadata: { [META_TENANT_ID]: tenant.id },
    });
    await this.prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        stripeCustomerId: customer.id,
        plan: Plan.FREE,
        status: SubStatus.ACTIVE,
      },
    });
    return customer.id;
  }

  /**
   * 指定プランの Stripe Checkout Session(subscription モード)を作成し、リダイレクト先 URL を返す。
   * TEAM は quantity をテナントのメンバー数にする(Subscription Quantity による人数課金、ADR-004)。
   * 呼び出し側(コントローラ)は所属・権限を確認済みである前提。owner の連絡先とメンバー数はここで取得する。
   */
  async createCheckoutSession(params: {
    tenantId: string;
    slug: string;
    name: string;
    plan: PaidPlan;
  }): Promise<{ url: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: params.tenantId },
      select: {
        owner: { select: { email: true, name: true } },
        _count: { select: { members: true } },
      },
    });
    if (!tenant) {
      throw new NotFoundException();
    }

    const customerId = await this.ensureStripeCustomer({
      id: params.tenantId,
      name: params.name,
      owner: tenant.owner,
    });
    const appBaseUrl = this.config.getOrThrow<string>('APP_BASE_URL');

    // 【Stripe API 呼び出し】ホスト型決済ページ(Checkout Session)を作成する。
    // 返り値 session.url にユーザーをリダイレクト → Stripe 側で決済 → success_url / cancel_url に戻る。
    // metadata / subscription_data.metadata の tenantId が Webhook 側との連携キー(どのテナントの課金か特定する)。
    const session = await this.stripe.client.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          price: this.stripe.priceIdForPlan(params.plan),
          quantity: params.plan === Plan.TEAM ? Math.max(1, tenant._count.members) : 1,
        },
      ],
      metadata: { [META_TENANT_ID]: params.tenantId },
      subscription_data: { metadata: { [META_TENANT_ID]: params.tenantId } },
      success_url: `${appBaseUrl}/w/${params.slug}?checkout=success`,
      cancel_url: `${appBaseUrl}/w/${params.slug}?checkout=cancel`,
    });
    if (!session.url) {
      throw new Error('Stripe did not return a Checkout Session URL');
    }
    return { url: session.url };
  }

  // ---------------------------------------------------------------------------
  // Webhook からの DB 同期
  // ---------------------------------------------------------------------------

  /** `checkout.session.completed`: 完了した Checkout から Subscription を取り直して DB に反映する。 */
  async completeCheckout(session: Stripe.Checkout.Session): Promise<void> {
    if (session.mode !== 'subscription' || !session.subscription) {
      return;
    }
    const subId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
    // 【Stripe API 呼び出し】Checkout 完了時点の最新の Subscription を取得し直す
    // (Checkout Session には Subscription の全フィールドが含まれないため)。
    const sub = await this.stripe.client.subscriptions.retrieve(subId);
    await this.applyStripeSubscription(sub);
  }

  /** `customer.subscription.created` / `.updated`: Stripe Subscription を DB の Subscription / Tenant.plan に反映する。 */
  async applyStripeSubscription(sub: Stripe.Subscription): Promise<void> {
    const tenantId = await this.resolveTenantId(sub);
    if (!tenantId) {
      this.logger.warn(`No tenant resolved for Stripe subscription ${sub.id} — skipping`);
      return;
    }

    const item = sub.items.data[0];
    const plan: Plan = this.planForPriceId(item?.price?.id) ?? Plan.FREE;
    const status = this.mapStatus(sub.status);
    const currentPeriodEnd = item ? dayjs.unix(item.current_period_end).toDate() : null;
    const canceledAt = sub.canceled_at ? dayjs.unix(sub.canceled_at).toDate() : null;
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

    await this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        stripeCustomerId: customerId,
        stripeSubId: sub.id,
        plan,
        status,
        currentPeriodEnd,
        canceledAt,
      },
      update: {
        stripeCustomerId: customerId,
        stripeSubId: sub.id,
        plan,
        status,
        currentPeriodEnd,
        canceledAt,
      },
    });
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { plan } });
  }

  /** `customer.subscription.deleted`: 解約。Free へ戻し、stripeSubId をクリアする。 */
  async cancelStripeSubscription(sub: Stripe.Subscription): Promise<void> {
    const tenantId = await this.resolveTenantId(sub);
    if (!tenantId) {
      this.logger.warn(`No tenant resolved for canceled Stripe subscription ${sub.id} — skipping`);
      return;
    }
    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: {
        plan: Plan.FREE,
        status: SubStatus.CANCELED,
        stripeSubId: null,
        canceledAt: new Date(),
      },
    });
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { plan: Plan.FREE } });
  }

  /** `invoice.paid`: 支払い遅延からの復帰。PAST_DUE だった Subscription を ACTIVE に戻す(プランは subscription.updated 側で同期)。 */
  async markInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const customerId = this.customerId(invoice.customer);
    if (!customerId) return;
    await this.prisma.subscription.updateMany({
      where: { stripeCustomerId: customerId, status: SubStatus.PAST_DUE },
      data: { status: SubStatus.ACTIVE },
    });
  }

  /** `invoice.payment_failed`: 支払い失敗。Subscription を PAST_DUE にする。 */
  async markInvoiceFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = this.customerId(invoice.customer);
    if (!customerId) return;
    await this.prisma.subscription.updateMany({
      where: { stripeCustomerId: customerId },
      data: { status: SubStatus.PAST_DUE },
    });
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  /** Stripe Subscription から tenantId を解決する(metadata → 既存行の照合の順)。 */
  private async resolveTenantId(sub: Stripe.Subscription): Promise<string | null> {
    const fromMeta = sub.metadata?.[META_TENANT_ID];
    if (fromMeta) return fromMeta;

    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const row = await this.prisma.subscription.findFirst({
      where: { OR: [{ stripeSubId: sub.id }, { stripeCustomerId: customerId }] },
      select: { tenantId: true },
    });
    return row?.tenantId ?? null;
  }

  /** Stripe Price ID から自プランを判定する(未知の price は null)。 */
  private planForPriceId(priceId: string | undefined): PaidPlan | null {
    if (!priceId) return null;
    if (priceId === this.stripe.priceIdForPlan(Plan.PRO)) return Plan.PRO;
    if (priceId === this.stripe.priceIdForPlan(Plan.TEAM)) return Plan.TEAM;
    return null;
  }

  /** Stripe Subscription の status を自前の SubStatus にマップする(case ラベルは Stripe API の文字列)。 */
  private mapStatus(status: Stripe.Subscription.Status): SubStatus {
    switch (status) {
      case 'active':
        return SubStatus.ACTIVE;
      case 'trialing':
        return SubStatus.TRIALING;
      case 'past_due':
      case 'unpaid':
      case 'paused':
        return SubStatus.PAST_DUE;
      case 'canceled':
        return SubStatus.CANCELED;
      case 'incomplete':
      case 'incomplete_expired':
        return SubStatus.INCOMPLETE;
      default:
        return SubStatus.INCOMPLETE;
    }
  }

  /** Invoice.customer(string | Customer | DeletedCustomer | null)から ID を取り出す。 */
  private customerId(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  ): string | null {
    if (!customer) return null;
    return typeof customer === 'string' ? customer : customer.id;
  }
}
