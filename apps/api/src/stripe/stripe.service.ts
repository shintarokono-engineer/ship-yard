import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Stripe SDK クライアントのラッパー(ADR-004)。
 * - シークレットキー(`STRIPE_SECRET_KEY`)で初期化
 * - Checkout 用の Price ID(`STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAM`)解決ヘルパー
 * - Webhook 署名シークレット(`STRIPE_WEBHOOK_SECRET`)の参照
 *
 * Webhook の `constructEvent`(署名検証)も `client` 経由で呼ぶ。
 */
@Injectable()
export class StripeService {
  /** Stripe API クライアント本体。Controller / Service から `stripe.client.checkout...` のように使う。 */
  readonly client: Stripe.Stripe;

  constructor(private readonly config: ConfigService) {
    // apiVersion は省略 = Stripe アカウントの既定バージョンに追従(MVP では十分。本番安定後に固定を検討)
    this.client = new Stripe(this.config.getOrThrow<string>('STRIPE_SECRET_KEY'));
  }

  /** Checkout の line_items に渡す Price ID をプランから解決する(FREE には Price が無い)。 */
  priceIdForPlan(plan: 'PRO' | 'TEAM'): string {
    const key = plan === 'PRO' ? 'STRIPE_PRICE_PRO' : 'STRIPE_PRICE_TEAM';
    return this.config.getOrThrow<string>(key);
  }

  /** Webhook 署名シークレット。ローカルは `stripe listen` の出力(whsec_...)、本番は Dashboard 登録時に取得。 */
  get webhookSecret(): string {
    return this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
  }
}
