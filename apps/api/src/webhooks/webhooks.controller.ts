import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type { Stripe } from '../stripe/stripe.types';
import { StripeService } from '../stripe/stripe.service';
import { StripeWebhookService } from './stripe-webhook.service';

/**
 * Stripe Webhook 受信エンドポイント(ADR-004)。
 *
 * - 署名検証には未加工リクエストボディが必要 → `main.ts` で `rawBody: true` を有効化し `req.rawBody`(Buffer)を使う。
 * - `TenantMiddleware` は `X-Tenant-Slug` ヘッダーが無いリクエストを素通しするため、このルートはテナント無しで通過する
 *   (Subscription 系イベントの tenantId は Stripe metadata から解決する設計)。
 * - 署名不正は 400(Stripe は再送しない)、処理失敗は 500(Stripe が再送)を返す。
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly stripe: StripeService,
    private readonly webhooks: StripeWebhookService,
  ) {}

  @Post('stripe')
  @HttpCode(200)
  async handleStripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body');
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: Stripe.Event;
    try {
      // 【Stripe SDK・ローカル計算(API 通信なし)】署名ヘッダー(t,v1)+ 共有シークレットでペイロードの真正性と
      // リプレイ耐性(タイムスタンプ ±5 分)を検証し、検証済みの Stripe.Event を返す。
      // 改ざん / 鍵違い / 古すぎる場合は throw → 下の catch で 400(Stripe は 4xx を再送しない)。
      event = this.stripe.client.webhooks.constructEvent(
        req.rawBody,
        signature,
        this.stripe.webhookSecret,
      );
    } catch {
      throw new BadRequestException('Webhook signature verification failed');
    }

    await this.webhooks.process(event);
    return { received: true };
  }
}
