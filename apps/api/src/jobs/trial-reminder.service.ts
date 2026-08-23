import { TrialNotificationKind } from '@shipyard/db';

import { dayjs, JST_OFFSET_HOURS } from '../common/time';
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
