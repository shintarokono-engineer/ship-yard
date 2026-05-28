import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WebhookEvent } from '@clerk/backend';
import type { Request } from 'express';
import { Webhook, WebhookVerificationError } from 'svix';

import type { Stripe } from '../stripe/stripe.types';
import { StripeService } from '../stripe/stripe.service';
import { ClerkWebhookService } from './clerk-webhook.service';
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
  private readonly logger = new Logger(WebhooksController.name);

  /**
   * Clerk Webhook 署名検証用の Svix Webhook インスタンス(Standard Webhooks 準拠)。
   * env 未設定でもアプリ起動は止めず、エンドポイント側で 500 を返す方式
   * (本番起動時に env チェックを行う運用上の選択。ローカル/CI で Clerk を使わないテストを阻害しない)。
   */
  private readonly clerkWebhook: Webhook | null;

  constructor(
    private readonly stripe: StripeService,
    private readonly webhooks: StripeWebhookService,
    private readonly clerkService: ClerkWebhookService,
    config: ConfigService,
  ) {
    const secret = config.get<string>('CLERK_WEBHOOK_SECRET');
    this.clerkWebhook = secret ? new Webhook(secret) : null;
    if (!secret) {
      this.logger.warn(
        'CLERK_WEBHOOK_SECRET is not set; POST /webhooks/clerk will respond 500 until configured',
      );
    }
  }

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

  /**
   * Clerk Webhook 受信エンドポイント(§9.10 Clerk webhook、Day 49)。
   *
   * - Svix の Standard Webhooks 仕様で署名検証(svix-id / svix-timestamp / svix-signature の 3 ヘッダー)。
   * - 検証失敗 = 400(Clerk は 4xx を再送しない)、処理失敗 = 500(Clerk が指数バックオフで再送)。
   * - 受信ボディは未加工 Buffer を `svix.Webhook.verify()` に渡し、`@clerk/backend` の `WebhookEvent` 型に narrowing する。
   * - Idempotency は `ClerkWebhookService` 側で `svix-id` をキーに `ClerkWebhookEvent` テーブルで担保。
   */
  @Post('clerk')
  @HttpCode(200)
  async handleClerk(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string | undefined,
    @Headers('svix-timestamp') svixTimestamp: string | undefined,
    @Headers('svix-signature') svixSignature: string | undefined,
  ): Promise<{ received: true }> {
    if (!this.clerkWebhook) {
      // 内部情報(env 名)を漏らさないため汎用メッセージ。Clerk 側で再送ループにならないよう
      // 503 ではなく 500 を残しつつ、サーバーログ側に詳細を出して運用が気づける形にする。
      this.logger.error('POST /webhooks/clerk invoked but CLERK_WEBHOOK_SECRET is not configured');
      throw new InternalServerErrorException('Webhook endpoint is not available');
    }
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body');
    }
    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException(
        'Missing one of svix-id / svix-timestamp / svix-signature headers',
      );
    }

    let event: WebhookEvent;
    try {
      // 【svix SDK・ローカル計算(API 通信なし)】Standard Webhooks 仕様(HMAC SHA-256 + タイムスタンプ ±5 分)で
      // 真正性とリプレイ耐性を検証し、検証済みパースド JSON を返す。Clerk の Event 型に narrowing。
      event = this.clerkWebhook.verify(req.rawBody.toString('utf8'), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as WebhookEvent;
    } catch (err) {
      // 署名検証失敗のみ 400 を返す(Clerk は 4xx を再送しない)。
      // それ以外の内部例外は再 throw して 500 にし、Clerk が再送する経路に乗せる
      // (svix SDK 自体のランタイムエラーを 400 で握り潰すと再送機会を失うため)。
      if (err instanceof WebhookVerificationError) {
        throw new BadRequestException('Clerk webhook signature verification failed');
      }
      throw err;
    }

    await this.clerkService.process(event, svixId);
    return { received: true };
  }
}
