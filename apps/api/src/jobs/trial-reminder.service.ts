import { Injectable, Logger } from '@nestjs/common';

import { isPrismaError, PrismaErrorCode, SubStatus, TrialNotificationKind } from '@shipyard/db';

import { dayjs, JST_OFFSET_HOURS } from '../common/time';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import type { Stripe } from '../stripe/stripe.types';
import { CANDIDATE_WINDOW_DAYS, THREE_DAYS_MAX_DIFF } from './jobs.constants';

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
 * Stripe 自身が `trial_settings.end_behavior.missing_payment_method: 'cancel'`(billing.service.ts)
 * で「既定の支払い方法が無ければ解約」を判定しており、その既定の支払い方法は Subscription 側
 * (`default_payment_method`)・Customer 側(`invoice_settings.default_payment_method`)の両方が
 * 対象になる。この関数はその Stripe の判定に合わせるため**両方を見る**。
 *
 * `save_default_payment_method: 'on_subscription'` は「決済が成立した時に」Subscription 側を
 * 更新する設定であり、トライアル中は決済が発生しないため Subscription 側は埋まらないことが多い。
 * 実際にはトライアル中は Customer 側(`invoice_settings.default_payment_method`)が主たる判定材料
 * になる。
 *
 * `customer` は `expand: ['customer']` で展開済みであることを前提とし、展開されていない場合
 * (ID 文字列)や削除済み Customer は判定不能なので「未登録」に倒す(通知を送る側に倒す)。
 */
export function hasPaymentMethod(sub: Stripe.Subscription): boolean {
  if (sub.default_payment_method) return true;

  const customer = sub.customer;
  if (typeof customer === 'string' || 'deleted' in customer) return false;

  return Boolean(customer.invoice_settings?.default_payment_method);
}

/** バッチ 1 回分の処理結果(エンドポイントのレスポンスボディにそのまま使う)。 */
export interface TrialReminderResult {
  /** DB から抽出した候補件数 */
  processed: number;
  /** 実際に送信した件数 */
  sent: { threeDays: number; lastDay: number };
  /** 対象外・送信済み・判定不能で送らなかった件数 */
  skipped: number;
  /** 送信を試みて失敗した件数 */
  failed: number;
}

/**
 * トライアル終了通知の日次バッチ(F20、ADR-012 v1.x)。
 *
 * EventBridge Rule + API destination から `POST /internal/jobs/trial-reminders` 経由で
 * 毎日 03:00 UTC(12:00 JST)に起動される。
 *
 * **冪等性**:`TrialNotification` への予約 INSERT →(送信)→ 失敗時 DELETE の順で処理する
 * (`AIUsageService` のクレジット予約と同じパターン)。unique 制約が App Runner のスケール
 * 多重発火と EventBridge の 24 時間リトライの両方を吸収する。
 */
@Injectable()
export class TrialReminderService {
  private readonly logger = new Logger(TrialReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly mail: MailService,
  ) {}

  async run(now: Date = new Date()): Promise<TrialReminderResult> {
    const windowEnd = dayjs(now).add(CANDIDATE_WINDOW_DAYS, 'day').toDate();

    // 候補抽出。`status = TRIALING` を必ず併記する:currentPeriodEnd 単体では
    // 「トライアル終了日」か「次回請求日」かを区別できず、有料契約中のテナントを
    // 拾って誤った文面を送ってしまうため。
    const candidates = await this.prisma.subscription.findMany({
      where: {
        status: SubStatus.TRIALING,
        currentPeriodEnd: { gt: now, lte: windowEnd },
      },
      select: {
        stripeSubId: true,
        currentPeriodEnd: true,
        tenant: {
          select: { id: true, name: true, slug: true, owner: { select: { email: true } } },
        },
      },
    });

    const result: TrialReminderResult = {
      processed: candidates.length,
      sent: { threeDays: 0, lastDay: 0 },
      skipped: 0,
      failed: 0,
    };

    for (const candidate of candidates) {
      const trialEnd = candidate.currentPeriodEnd;
      if (!trialEnd || !candidate.stripeSubId) {
        result.skipped++;
        continue;
      }

      const kind = resolveNotificationKind(trialEnd, now);
      if (!kind) {
        result.skipped++;
        continue;
      }

      const tenant = candidate.tenant;

      // カード登録済みは終了時に課金開始へ遷移するため対象外。Stripe 参照が失敗した場合は
      // その日は送らず次回に回す(外部 API 障害で送信記録を汚さないため)。
      let stripeSub: Stripe.Subscription;
      try {
        stripeSub = await this.stripe.client.subscriptions.retrieve(candidate.stripeSubId, {
          expand: ['customer'],
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Failed to retrieve Stripe subscription for tenant ${tenant.id}: ${msg}`);
        result.skipped++;
        continue;
      }

      if (hasPaymentMethod(stripeSub)) {
        result.skipped++;
        continue;
      }

      // 予約 INSERT。unique 違反 = 送信済み or 他インスタンスが処理中。
      try {
        await this.prisma.trialNotification.create({ data: { tenantId: tenant.id, kind } });
      } catch (e) {
        if (isPrismaError(e, PrismaErrorCode.UNIQUE_VIOLATION)) {
          result.skipped++;
          continue;
        }
        throw e;
      }

      try {
        await this.mail.sendTrialReminder({
          to: tenant.owner.email,
          workspaceName: tenant.name,
          workspaceSlug: tenant.slug,
          daysLeft: daysLeftFor(trialEnd, now),
          trialEndsAt: trialEnd,
        });
        if (kind === TrialNotificationKind.LAST_DAY) result.sent.lastDay++;
        else result.sent.threeDays++;
      } catch (e) {
        // 送信に失敗したら予約を解放し、翌日リトライできる状態に戻す。
        await this.prisma.trialNotification
          .delete({ where: { tenantId_kind: { tenantId: tenant.id, kind } } })
          .catch(() => undefined);
        result.failed++;
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`Failed to send trial reminder to tenant ${tenant.id}: ${msg}`);
      }
    }

    // 「発火したが対象 0 件」と「発火しなかった」を区別できるよう、毎回必ず出力する。
    this.logger.log(`trial-reminders finished: ${JSON.stringify(result)}`);
    return result;
  }
}
