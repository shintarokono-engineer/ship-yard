import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Plan, SubStatus } from '@shipyard/db';

import { dayjs } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { type PaidPlan, StripeService } from '../stripe/stripe.service';
import type { Stripe } from '../stripe/stripe.types';

/** Checkout / Subscription の metadata に載せるテナント識別キー(Webhook 側で読み取る) */
const META_TENANT_ID = 'tenantId';

/** ADR-012 で確定した Pro トライアル期間。Stripe `trial_period_days` に渡す。 */
const TRIAL_PERIOD_DAYS = 7;

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
  // テナント作成時の初期化(`WorkspacesService.create` から呼ばれる)
  // ---------------------------------------------------------------------------

  /**
   * 新規テナント作成時に Stripe Customer と **7 日 Pro トライアル** Subscription を初期化する(ADR-012)。
   *
   * Stripe `trial_settings.end_behavior.missing_payment_method: 'cancel'` で「クレカ登録不要」を実現:
   * - 作成時:Subscription を `trialing` 状態で作成、Tenant.plan = PRO に
   * - 7 日後:PM 登録なしなら Stripe が自動キャンセル → Webhook `customer.subscription.deleted` →
   *   `cancelStripeSubscription` で Tenant.plan = FREE(= AI 停止フォールバック)
   * - 7 日後:PM 登録ありなら `active` に遷移 → Webhook `customer.subscription.updated` で同期
   *
   * 失敗してもベストエフォート(Stripe ダウン・Price 未設定でもテナント作成自体は成立):
   * - 失敗時は `false` を返し、Tenant.plan は FREE のまま(= 即 AI 停止状態でユーザーは Billing から手動アップグレード可)
   * - 次回 Checkout で `ensureStripeCustomer` が lazy 作成にフォールバック
   */
  async initializeProTrialSubscription(tenant: {
    id: string;
    name: string;
    owner: { email: string; name: string | null };
  }): Promise<boolean> {
    try {
      const customerId = await this.ensureStripeCustomer(tenant);

      // 【Stripe API 呼び出し】Pro 価格 + 7 日トライアルで Subscription を作成。
      // クレカ未登録でも作成可能(trial_settings で「期限切れ + PM なし → cancel」を指定)。
      const priceId = this.stripe.priceIdForPlan(Plan.PRO);
      const stripeSub = await this.stripe.client.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId, quantity: 1 }],
        trial_period_days: TRIAL_PERIOD_DAYS,
        trial_settings: {
          end_behavior: { missing_payment_method: 'cancel' },
        },
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        metadata: { [META_TENANT_ID]: tenant.id },
      });

      const trialEnd = stripeSub.trial_end ? dayjs.unix(stripeSub.trial_end).toDate() : null;

      // DB をトライアル状態に更新(applyStripeSubscription と同等の write を即時実施し、Webhook 到達前の race を回避)
      await this.prisma.subscription.update({
        where: { tenantId: tenant.id },
        data: {
          stripeSubId: stripeSub.id,
          plan: Plan.PRO,
          status: SubStatus.TRIALING,
          quantity: 1,
          currentPeriodEnd: trialEnd,
        },
      });
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { plan: Plan.PRO },
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Failed to initialize Pro trial for tenant ${tenant.id}: ${msg}`);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Team seat 同期(ADR-012 第 1 層 Saga)
  // ---------------------------------------------------------------------------

  /**
   * Team プランの Stripe Subscription Quantity を内部の `TenantMember.count` に合わせて同期する(ADR-012 第 1 層)。
   *
   * 招待承諾・退会のフローから、**DB トランザクション commit 後** に呼ばれる Saga forward step:
   * - 失敗してもユーザー操作は成功扱い(本メソッドは呼び出し側で try/catch する)
   * - 第 3 層 reconciliation バッチ(v1.x)が翌日に再同期するため、短時間のズレは許容
   *
   * Team プラン以外(FREE / PRO / Subscription 未作成)は no-op。Stripe 側 API は同じ quantity を
   * 何回呼んでも結果が変わらない(冪等)ので、race による多重呼び出しも安全。
   */
  async syncSubscriptionQuantity(tenantId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      select: { plan: true, stripeSubId: true },
    });
    if (!sub || sub.plan !== Plan.TEAM || !sub.stripeSubId) {
      // FREE / PRO は seat 概念なし、stripeSubId 未確保のテナントは Checkout 完了前なのでスキップ
      return;
    }

    const seats = await this.prisma.tenantMember.count({ where: { tenantId } });
    if (seats < 1) {
      // 念のためのガード(Team プランで member 0 は通常ありえない)
      this.logger.warn(`Skipping Stripe quantity sync for tenant ${tenantId}: member count is 0`);
      return;
    }

    // 【Stripe API 呼び出し】Subscription Quantity を実 seat 数に揃える。冪等。
    // Stripe では quantity は subscription item ごとに持つため、まず最新の Subscription を取得して
    // item ID を解決し、items[0].quantity を更新する。受領 Webhook(applyStripeSubscription)が
    // 自前 DB の quantity も上書きするが、即時反映のため先回りで DB も更新する。
    const stripeSub = await this.stripe.client.subscriptions.retrieve(sub.stripeSubId);
    const itemId = stripeSub.items.data[0]?.id;
    if (!itemId) {
      this.logger.warn(
        `Skipping Stripe quantity sync for tenant ${tenantId}: Subscription ${sub.stripeSubId} has no items`,
      );
      return;
    }
    await this.stripe.client.subscriptions.update(sub.stripeSubId, {
      items: [{ id: itemId, quantity: seats }],
    });
    await this.prisma.subscription.update({
      where: { tenantId },
      data: { quantity: seats },
    });
  }

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

  /**
   * テナントの課金状態(Billing 画面で表示する詳細)を返す。
   *
   * `GET /workspaces/:slug` の汎用レスポンスは Plan のみで Subscription 詳細(status / currentPeriodEnd /
   * canceledAt)を含まないため、Billing 画面専用に分離した軽量 endpoint(OWNER 限定)。
   *
   * Subscription 行が無い場合(Day 19 以前の旧テナント / Stripe 障害復旧待ち)は `Tenant.plan` から
   * 復元した最小限の状態を返す(`status: ACTIVE` + 期日系は null)。Portal を開けば `ensureStripeCustomer`
   * で行が作られるので、表示と Portal 利用は両立する。
   */
  async getBillingDetail(params: { tenantId: string; planFallback: Plan }): Promise<{
    plan: Plan;
    status: SubStatus;
    currentPeriodEnd: Date | null;
    canceledAt: Date | null;
  }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId: params.tenantId },
      select: { plan: true, status: true, currentPeriodEnd: true, canceledAt: true },
    });
    if (sub) {
      return sub;
    }
    return {
      plan: params.planFallback,
      status: SubStatus.ACTIVE,
      currentPeriodEnd: null,
      canceledAt: null,
    };
  }

  /**
   * Stripe Customer Portal Session を作成し、リダイレクト先 URL を返す。
   * Portal 内で支払い方法変更 / 請求書履歴 / プラン変更 / 解約をすべて Stripe 側 UI で完結させる
   * (Notion / Linear / Vercel / Resend 等と同じ標準パターン)。
   *
   * - 呼び出し側(コントローラ)は所属・OWNER 権限を確認済みである前提
   * - `ensureStripeCustomer` で Customer を確保(Day 19 以前のテナント / Stripe 障害復旧時の lazy 作成)
   * - Stripe Dashboard で Customer Portal の Activation が必要(未設定だと Stripe API が 400 を返す)
   */
  async createPortalSession(params: {
    tenantId: string;
    slug: string;
    name: string;
  }): Promise<{ url: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: params.tenantId },
      select: { owner: { select: { email: true, name: true } } },
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

    // 【Stripe API 呼び出し】Customer Portal Session を作成。
    // 戻り値 session.url にユーザーをリダイレクト → Stripe 側で操作 → return_url に戻る。
    const session = await this.stripe.client.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appBaseUrl}/w/${params.slug}/settings/billing`,
    });
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
    // ADR-012 第 2 層:Stripe の Subscription Quantity を内部 DB にミラーする(AI クレジット計算の真実の源)
    const quantity = item?.quantity ?? 1;

    await this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        stripeCustomerId: customerId,
        stripeSubId: sub.id,
        plan,
        status,
        quantity,
        currentPeriodEnd,
        canceledAt,
      },
      update: {
        stripeCustomerId: customerId,
        stripeSubId: sub.id,
        plan,
        status,
        quantity,
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
