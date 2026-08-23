import { TrialNotificationKind } from '@shipyard/db';

import { daysLeftFor, resolveNotificationKind } from './trial-reminder.service';

/** バッチの実行時刻。2026-08-23T03:00:00Z = 2026-08-23 12:00 JST。 */
const NOW = new Date('2026-08-23T03:00:00Z');

/** JST の指定日 23:59:59 を UTC の Date にする(トライアル終了時刻の形)。 */
const jstEndOfDay = (isoDate: string): Date => new Date(`${isoDate}T14:59:59Z`);

describe('daysLeftFor(JST の日付差)', () => {
  it('同じ JST 日なら 0', () => {
    expect(daysLeftFor(jstEndOfDay('2026-08-23'), NOW)).toBe(0);
  });

  it('翌 JST 日なら 1', () => {
    expect(daysLeftFor(jstEndOfDay('2026-08-24'), NOW)).toBe(1);
  });

  it('3 日後なら 3', () => {
    expect(daysLeftFor(jstEndOfDay('2026-08-26'), NOW)).toBe(3);
  });
});

describe('resolveNotificationKind', () => {
  it('日差 0(終了当日)は LAST_DAY', () => {
    expect(resolveNotificationKind(jstEndOfDay('2026-08-23'), NOW)).toBe(
      TrialNotificationKind.LAST_DAY,
    );
  });

  it('日差 3 は THREE_DAYS', () => {
    expect(resolveNotificationKind(jstEndOfDay('2026-08-26'), NOW)).toBe(
      TrialNotificationKind.THREE_DAYS,
    );
  });

  it('日差 1 も THREE_DAYS(バッチが落ちた日の取りこぼしを翌日に拾うため)', () => {
    expect(resolveNotificationKind(jstEndOfDay('2026-08-24'), NOW)).toBe(
      TrialNotificationKind.THREE_DAYS,
    );
  });

  it('日差 4 以上は対象外', () => {
    expect(resolveNotificationKind(jstEndOfDay('2026-08-27'), NOW)).toBeNull();
  });

  it('実行時点で既に終了している場合は対象外', () => {
    expect(resolveNotificationKind(new Date('2026-08-23T02:00:00Z'), NOW)).toBeNull();
  });

  it('終了時刻が実行時刻ちょうどの場合も対象外(境界は終了扱い)', () => {
    expect(resolveNotificationKind(new Date(NOW), NOW)).toBeNull();
  });

  it('UTC 日付と JST 日付が食い違う時間帯でも JST の日付で判定する', () => {
    // 2026-08-22T20:00:00Z = 2026-08-23 05:00 JST(UTC ではまだ 08-22)。
    // utcOffset(0) で丸めると日差 1 = THREE_DAYS になってしまうため、
    // JST で丸めていることをこのケースが担保する。
    const earlyMorningJst = new Date('2026-08-22T20:00:00Z');

    expect(daysLeftFor(jstEndOfDay('2026-08-23'), earlyMorningJst)).toBe(0);
    expect(resolveNotificationKind(jstEndOfDay('2026-08-23'), earlyMorningJst)).toBe(
      TrialNotificationKind.LAST_DAY,
    );
  });
});
