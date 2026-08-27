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

/**
 * バッチ 1 回分の処理結果(エンドポイントのレスポンスボディにそのまま使う)。
 *
 * 不変条件: `processed === sent.threeDays + sent.lastDay + skipped + stripeErrors + failed`
 * (候補ごとに必ずこのいずれか 1 つだけが加算される。ただし `TrialNotification` の予約
 * INSERT が unique 違反以外の理由で失敗した場合は `run()` 自体が reject するため、
 * その場合この不変条件を満たす結果オブジェクトは返らない)。
 */
export interface TrialReminderResult {
  /** DB から抽出した候補件数 */
  processed: number;
  /** 実際に送信した件数 */
  sent: { threeDays: number; lastDay: number };
  /** 対象外・送信済み・データ欠損で送らなかった件数(Stripe 参照失敗は `stripeErrors` に別計上) */
  skipped: number;
  /**
   * Stripe 参照に失敗して当日は送らなかった件数。外部 API 障害の兆候なので `skipped`
   * とは分けて数える。`skipped` に混ぜてしまうと「健全な対象外」なのか「Stripe 障害が
   * 始まっている」のかを CloudWatch のメトリクスだけで判別できず、Stripe Webhook が
   * 気付かれずに止まっていた過去の障害(2026-08-15)と同じ壊れ方をしうる。
   */
  stripeErrors: number;
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
 * (`AIUsageService` のクレジット予約と発想は同じだが、呼び出し箇所がここ 1 つのため
 * `withCreditReservation` のような汎用ラッパーには抽出せず、ループ内に open-code している)。
 * unique 制約が App Runner のスケール多重発火と EventBridge の 24 時間リトライの
 * 両方を吸収する。
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
      // 終了が近い順(= LAST_DAY から)に処理する。中断(下記 unique 違反以外の DB
      // エラー等)した場合、THREE_DAYS は日差 1〜3 の幅があるため翌日以降でも拾えるが、
      // LAST_DAY(日差 0)は翌日には `currentPeriodEnd <= now` で「終了済み」と判定され
      // 二度と送れない。終了が近い候補を先に処理することで、中断時の恒久的な
      // 機会損失(特定ユーザーへの通知の永久欠落)を最小化する。
      orderBy: { currentPeriodEnd: 'asc' },
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
      stripeErrors: 0,
      failed: 0,
    };

    // 正常にループを完走したかどうか。中断(rethrow)した場合も finally で必ず部分集計を
    // ログに出す(中断すると通常の完了ログに届かず、例外スタックだけが残ってしまうため)。
    let completed = false;
    try {
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

        // Stripe 参照が失敗した場合はその日は送らず次回に回す(外部 API 障害で送信記録を
        // 汚さないため)。`skipped` ではなく `stripeErrors` に数え、外部 API 障害の兆候を
        // 「健全な対象外」と区別して CloudWatch から判別できるようにする。
        let stripeSub: Stripe.Subscription;
        try {
          stripeSub = await this.stripe.client.subscriptions.retrieve(candidate.stripeSubId, {
            expand: ['customer'],
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(
            `Failed to retrieve Stripe subscription ${candidate.stripeSubId} for tenant ${tenant.id}: ${msg}`,
          );
          result.stripeErrors++;
          continue;
        }

        // カード登録済みは終了時に課金開始へ遷移するため対象外。
        if (hasPaymentMethod(stripeSub)) {
          result.skipped++;
          continue;
        }

        // 予約 INSERT。unique 違反 = 送信済み or 他インスタンスが処理中。
        // unique 違反以外は「予約自体ができていない」= DB 障害等なので握り潰さず
        // run() ごと中断する(下の try/finally が部分集計をログに出す)。
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
          this.logger.error(
            `Failed to send trial reminder (kind=${kind}) to tenant ${tenant.id}: ${msg}`,
          );
        }
      }
      completed = true;
    } finally {
      // 「発火したが対象 0 件」と「発火しなかった」に加え、正常完了と中断もログから
      // 区別できるよう、毎回(中断時も)必ず出力する。
      this.logger.log(
        completed
          ? `trial-reminders finished: ${JSON.stringify(result)}`
          : `trial-reminders aborted: ${JSON.stringify(result)}`,
      );
    }

    return result;
  }
}
