import { dayjs } from '../common/time';
import { computeTrialEndUnix } from './billing.service';

/**
 * F20:トライアル終了時刻を JST の日末に揃える。
 * 作成時刻が何時であっても「作成日 + 7 日の 23:59:59 JST」に収束することを確認する。
 */
describe('computeTrialEndUnix', () => {
  const jstLabel = (unix: number): string =>
    dayjs.unix(unix).utcOffset(9).format('YYYY-MM-DD HH:mm:ss');

  it('JST 午前に作成しても終了は 7 日後の 23:59:59 JST', () => {
    // 2026-08-23T00:00:00Z = 2026-08-23 09:00 JST
    expect(jstLabel(computeTrialEndUnix(new Date('2026-08-23T00:00:00Z')))).toBe(
      '2026-08-30 23:59:59',
    );
  });

  it('JST 深夜 0 時ちょうどに作成しても同じ日付の 7 日後になる', () => {
    // 2026-08-22T15:00:00Z = 2026-08-23 00:00 JST
    expect(jstLabel(computeTrialEndUnix(new Date('2026-08-22T15:00:00Z')))).toBe(
      '2026-08-30 23:59:59',
    );
  });

  it('JST 23:59 に作成しても同じ日付の 7 日後になる', () => {
    // 2026-08-23T14:59:00Z = 2026-08-23 23:59 JST
    expect(jstLabel(computeTrialEndUnix(new Date('2026-08-23T14:59:00Z')))).toBe(
      '2026-08-30 23:59:59',
    );
  });

  it('月をまたぐ場合も 7 日後の JST 日末になる', () => {
    // 2026-08-28T00:00:00Z = 2026-08-28 09:00 JST → 7 日後は 9 月に入る
    expect(jstLabel(computeTrialEndUnix(new Date('2026-08-28T00:00:00Z')))).toBe(
      '2026-09-04 23:59:59',
    );
  });
});
