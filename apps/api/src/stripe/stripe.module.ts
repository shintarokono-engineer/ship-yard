import { Global, Module } from '@nestjs/common';

import { StripeService } from './stripe.service';

/**
 * Stripe SDK クライアント(StripeService)をアプリ全体で利用可能にするグローバル Module。
 * Webhook 受信 Controller / Checkout 作成 API から `StripeService` を DI して使う。
 */
@Global()
@Module({
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
