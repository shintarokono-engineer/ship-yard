import { TrialNotificationKind } from '@shipyard/db';

import { dayjs, JST_OFFSET_HOURS } from '../common/time';
import type { Stripe } from '../stripe/stripe.types';
import { THREE_DAYS_MAX_DIFF } from './jobs.constants';

/**
 * トライアル終了日時と実行時刻の **JST 日付差** を返す(0 = 終了当日)。
 *
 * 時間差ではなく日付差で扱うのは、`computeTrialEndUnix`(billing.service.ts)が
 * 終了時刻を JST 日末に揃えているため。これにより「3 日前」「当日」が
 * 実行時刻に依存せず一意に決まる。
 */
export function daysLeftFor(currentPeriodEnd: Date, now: Date): number {
  const endDay = dayjs(currentPeriodEnd).utcOffset(JST_OFFSET_HOURS).startOf('day');
  const nowDay = dayjs(now).utcOffset(JST_OFFSET_HOURS).startOf('day');
  return endDay.diff(nowDay, 'day');
}

/**
 * 送るべき通知種別を返す。対象外なら null。
 *
 * - 日差 0 → LAST_DAY(終了当日)
 * - 日差 1〜3 → THREE_DAYS(未送信のものだけが実際に送られる。送信済み判定は
 *   `TrialNotification` の unique 制約が行うため、ここでは幅を持たせてよい)
 * - 実行時点で終了済み、または日差 4 以上 → null
 */
export function resolveNotificationKind(
  currentPeriodEnd: Date,
  now: Date,
): TrialNotificationKind | null {
  if (currentPeriodEnd.getTime() <= now.getTime()) return null;

  const diff = daysLeftFor(currentPeriodEnd, now);
  if (diff === 0) return TrialNotificationKind.LAST_DAY;
  if (diff >= 1 && diff <= THREE_DAYS_MAX_DIFF) return TrialNotificationKind.THREE_DAYS;
  return null;
}

/**
 * トライアル中の Subscription に支払い方法が登録済みかを判定する。
 *
 * Checkout 経由の登録は Subscription の `default_payment_method` に、Customer Portal 経由の
 * 登録は Customer の `invoice_settings.default_payment_method` に入るため、**両方を見る**。
 * `customer` は `expand: ['customer']` で展開済みであることを前提とし、展開されていない場合
 * (ID 文字列)や削除済み Customer は判定不能なので「未登録」に倒す(通知を送る側に倒す)。
 */
export function hasPaymentMethod(sub: Stripe.Subscription): boolean {
  if (sub.default_payment_method) return true;

  const customer = sub.customer;
  if (typeof customer === 'string' || 'deleted' in customer) return false;

  return Boolean(customer.invoice_settings?.default_payment_method);
}
