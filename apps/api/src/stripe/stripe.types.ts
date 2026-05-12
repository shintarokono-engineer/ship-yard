/**
 * Stripe の名前空間型(`Stripe.Event` / `Stripe.Checkout.Session` / `Stripe.Subscription` 等)を re-export する。
 *
 * stripe-node v22 の CommonJS エントリは `export = StripeConstructor` で、`import Stripe from 'stripe'` の
 * `Stripe` には名前空間の型メンバーが含まれない(`Stripe.Stripe` = インスタンス型しか取れない)。
 * そこで型は内部の `stripe.core` から取り出す。これは型のみの re-export なのでコンパイル時に消える(ランタイム影響なし)。
 *
 * 値(`new Stripe(...)`)は引き続き `import Stripe from 'stripe'` を使う(StripeService 参照)。
 */
export type { Stripe } from 'stripe/cjs/stripe.core';
