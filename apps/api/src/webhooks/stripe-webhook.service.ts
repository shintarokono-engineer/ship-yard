import { Injectable, Logger } from '@nestjs/common';

import { type Prisma, WebhookStatus } from '@shipyard/db';

import { BillingService } from '../billing/billing.service';
import type { Stripe } from '../stripe/stripe.types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Stripe Webhook イベントの処理本体(ADR-004)。
 *
 * - Idempotency: `WebhookEvent.stripeEventId`(ユニーク制約)で重複配信を吸収する。
 *   既に PROCESSED 済みのイベントは何もしない。
 * - 処理中に例外が出たら FAILED を記録して re-throw → Stripe が指数バックオフで再送する。
 * - イベント種別ごとの DB 同期は handle() で BillingService に委譲する(Subscription 系 5 イベント)。
 *
 * 注: `WebhookEvent` はテナントを持たない例外モデル(受信時点では tenantId 未確定)。
 * tenantId が要るイベントは Stripe metadata から解決する設計。
 */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /** 検証済みの Stripe イベントを処理する(冪等)。 */
  async process(event: Stripe.Event): Promise<void> {
    const already = await this.prisma.webhookEvent.findUnique({
      where: { stripeEventId: event.id },
      select: { status: true },
    });
    if (already?.status === WebhookStatus.PROCESSED) {
      this.logger.log(`Duplicate delivery, skipping: ${event.id} (${event.type})`);
      return;
    }

    const payload = JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue;
    try {
      await this.handle(event);
      await this.prisma.webhookEvent.upsert({
        where: { stripeEventId: event.id },
        create: {
          stripeEventId: event.id,
          type: event.type,
          payload,
          status: WebhookStatus.PROCESSED,
        },
        update: { status: WebhookStatus.PROCESSED, processedAt: new Date() },
      });
    } catch (err) {
      this.logger.error(
        `Failed to process Stripe event ${event.id} (${event.type})`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.prisma.webhookEvent.upsert({
        where: { stripeEventId: event.id },
        create: {
          stripeEventId: event.id,
          type: event.type,
          payload,
          status: WebhookStatus.FAILED,
        },
        update: { status: WebhookStatus.FAILED },
      });
      throw err;
    }
  }

  /** イベント種別ごとの処理(ADR-004 の 5 イベント。それ以外はログのみ)。 */
  private async handle(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.billing.completeCheckout(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.billing.applyStripeSubscription(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.billing.cancelStripeSubscription(event.data.object);
        break;
      case 'invoice.paid':
        await this.billing.markInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.billing.markInvoiceFailed(event.data.object);
        break;
      default:
        this.logger.debug(`Unhandled event type: ${event.type} (${event.id})`);
    }
  }
}
