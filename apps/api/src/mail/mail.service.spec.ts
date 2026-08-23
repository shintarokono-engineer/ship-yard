import { buildTrialReminderSubject } from './mail.service';

describe('buildTrialReminderSubject', () => {
  it('daysLeft=0(終了当日)は当日向けの件名になる', () => {
    expect(buildTrialReminderSubject(0)).toBe('本日 Neorie のトライアルが終了します');
  });

  it('daysLeft=1 は残り日数を含む件名になる(日差 1〜3 のいずれでも到達しうる値)', () => {
    expect(buildTrialReminderSubject(1)).toBe('あと 1 日で Neorie のトライアルが終了します');
  });

  it('daysLeft=2 は残り日数を含む件名になる(日差 1〜3 のいずれでも到達しうる値)', () => {
    expect(buildTrialReminderSubject(2)).toBe('あと 2 日で Neorie のトライアルが終了します');
  });

  it('daysLeft=3 は残り日数を含む件名になる(バッチが本来想定する 3 日前)', () => {
    expect(buildTrialReminderSubject(3)).toBe('あと 3 日で Neorie のトライアルが終了します');
  });
});
