import { Prisma, TrialNotificationKind } from '@shipyard/db';

import type { Stripe } from '../stripe/stripe.types';
import {
  daysLeftFor,
  hasPaymentMethod,
  resolveNotificationKind,
  TrialReminderService,
} from './trial-reminder.service';

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

describe('hasPaymentMethod', () => {
  /** 判定に必要なフィールドだけを持つ最小オブジェクトを Stripe.Subscription として渡す。 */
  const asSub = (partial: unknown): Stripe.Subscription => partial as Stripe.Subscription;

  it('Subscription 側に default_payment_method があれば登録済み', () => {
    expect(hasPaymentMethod(asSub({ default_payment_method: 'pm_123', customer: 'cus_1' }))).toBe(
      true,
    );
  });

  it('Customer 側の invoice_settings に既定 PM があれば登録済み(Portal 経由の追加を拾う)', () => {
    expect(
      hasPaymentMethod(
        asSub({
          default_payment_method: null,
          customer: { invoice_settings: { default_payment_method: 'pm_456' } },
        }),
      ),
    ).toBe(true);
  });

  it('どちらにも無ければ未登録', () => {
    expect(
      hasPaymentMethod(
        asSub({
          default_payment_method: null,
          customer: { invoice_settings: { default_payment_method: null } },
        }),
      ),
    ).toBe(false);
  });

  it('customer が展開されず ID 文字列のままなら未登録として扱う', () => {
    expect(hasPaymentMethod(asSub({ default_payment_method: null, customer: 'cus_1' }))).toBe(
      false,
    );
  });

  it('削除済み Customer は未登録として扱う', () => {
    expect(
      hasPaymentMethod(
        asSub({ default_payment_method: null, customer: { deleted: true, id: 'cus_1' } }),
      ),
    ).toBe(false);
  });

  it('deleted キーを持つが undefined の Customer も未登録として扱う(in 演算子で判定するため)', () => {
    expect(
      hasPaymentMethod(
        asSub({
          default_payment_method: null,
          customer: { deleted: undefined, invoice_settings: { default_payment_method: 'pm_789' } },
        }),
      ),
    ).toBe(false);
  });

  it('既定 PM が空文字列なら未登録として扱う', () => {
    expect(
      hasPaymentMethod(
        asSub({
          default_payment_method: null,
          customer: { invoice_settings: { default_payment_method: '' } },
        }),
      ),
    ).toBe(false);
  });
});

/** DB から返る候補 1 件(findMany の select に対応した形)。 */
const candidateRow = (overrides: Record<string, unknown> = {}) => ({
  stripeSubId: 'sub_1',
  currentPeriodEnd: jstEndOfDay('2026-08-23'), // 日差 0 = LAST_DAY
  tenant: {
    id: 't1',
    name: 'デモワークスペース',
    slug: 'demo',
    owner: { email: 'owner@example.com' },
  },
  ...overrides,
});

/** Prisma の unique 制約違反(P2002)を再現する。 */
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

/** フェイク依存を注入した TrialReminderService と、呼び出し記録を返す。 */
function buildService(opts: {
  candidates: ReturnType<typeof candidateRow>[];
  createThrows?: unknown;
  sendThrows?: unknown;
  /** Stripe が返す既定の支払い方法(null = 未登録) */
  paymentMethod?: string | null;
}) {
  const created: unknown[] = [];
  const deleted: unknown[] = [];
  const sent: unknown[] = [];

  const prisma = {
    subscription: { findMany: async () => opts.candidates },
    trialNotification: {
      create: async (args: { data: unknown }) => {
        if (opts.createThrows) throw opts.createThrows;
        created.push(args.data);
        return args.data;
      },
      delete: async (args: { where: unknown }) => {
        deleted.push(args.where);
        return args.where;
      },
    },
  };

  const retrieveArgs: unknown[] = [];

  const stripe = {
    client: {
      subscriptions: {
        retrieve: async (id: string, options?: unknown) => {
          retrieveArgs.push({ id, options });
          return {
            default_payment_method: opts.paymentMethod ?? null,
            customer: 'cus_1',
          };
        },
      },
    },
  };

  const mail = {
    sendTrialReminder: async (input: unknown) => {
      if (opts.sendThrows) throw opts.sendThrows;
      sent.push(input);
    },
  };

  const service = new TrialReminderService(prisma as never, stripe as never, mail as never);
  return { service, created, deleted, sent, retrieveArgs };
}

describe('TrialReminderService.run', () => {
  it('未送信・カード未登録なら送信し、集計に反映する', async () => {
    const { service, sent, created } = buildService({
      candidates: [
        candidateRow(),
        candidateRow({
          stripeSubId: 'sub_2',
          currentPeriodEnd: jstEndOfDay('2026-08-26'), // 日差 3 = THREE_DAYS
          tenant: {
            id: 't2',
            name: '別ワークスペース',
            slug: 'other',
            owner: { email: 'other@example.com' },
          },
        }),
      ],
    });

    const result = await service.run(NOW);

    expect(result).toEqual({
      processed: 2,
      sent: { threeDays: 1, lastDay: 1 },
      skipped: 0,
      failed: 0,
    });
    expect(sent).toHaveLength(2);
    expect(created).toHaveLength(2);
  });

  it('送信済み(unique 違反)ならメールを送らず skipped に数える', async () => {
    const { service, sent } = buildService({
      candidates: [candidateRow()],
      createThrows: uniqueViolation(),
    });

    const result = await service.run(NOW);

    expect(result.skipped).toBe(1);
    expect(result.sent).toEqual({ threeDays: 0, lastDay: 0 });
    expect(sent).toHaveLength(0);
  });

  it('カード登録済みならメールを送らず、予約 INSERT もしない', async () => {
    const { service, sent, created } = buildService({
      candidates: [candidateRow()],
      paymentMethod: 'pm_123',
    });

    const result = await service.run(NOW);

    expect(result.skipped).toBe(1);
    expect(sent).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it('送信に失敗したら予約行を削除して failed に数える', async () => {
    const { service, deleted } = buildService({
      candidates: [candidateRow()],
      sendThrows: new Error('Resend send failed'),
    });

    const result = await service.run(NOW);

    expect(result.failed).toBe(1);
    expect(deleted).toEqual([
      { tenantId_kind: { tenantId: 't1', kind: TrialNotificationKind.LAST_DAY } },
    ]);
  });

  it('日差 4 以上の候補は対象外として skipped に数える', async () => {
    const { service, sent } = buildService({
      candidates: [candidateRow({ currentPeriodEnd: jstEndOfDay('2026-08-27') })],
    });

    const result = await service.run(NOW);

    expect(result.skipped).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it('Stripe 参照時に customer を展開する(展開を落とすと Portal 登録済みの人に誤送信するため)', async () => {
    const { service, retrieveArgs } = buildService({ candidates: [candidateRow()] });

    await service.run(NOW);

    expect(retrieveArgs).toEqual([{ id: 'sub_1', options: { expand: ['customer'] } }]);
  });
});
