import {
  Controller,
  HttpCode,
  InternalServerErrorException,
  Post,
  UseGuards,
} from '@nestjs/common';

import { InternalJobGuard } from './internal-job.guard';
import { TrialReminderService, type TrialReminderResult } from './trial-reminder.service';

/**
 * 内部ジョブの受け口(F20 / 将来の F15 Reconciliation)。
 *
 * EventBridge Rule + API destination から日次で叩かれる。`TenantMiddleware` は
 * `X-Tenant-Slug` の無いリクエストを素通しするため、テナント無しで通過する(webhook と同じ経路)。
 *
 * **`internal` はパス名の慣習にすぎない**:`webhooks` 同様にインターネットから到達可能で、
 * ネットワーク的な隔離は無い。防御は `InternalJobGuard` が検証する共有シークレット
 * (ヘッダ)のみ。WAF / レート制限の適用範囲を検討する際はこの前提で判断すること。
 */
@Controller('internal/jobs')
@UseGuards(InternalJobGuard)
export class JobsController {
  constructor(private readonly trialReminders: TrialReminderService) {}

  /**
   * トライアル終了通知バッチを実行する。
   *
   * **送信を試みた全件が失敗した場合のみ 500 を返す**(メール基盤全断が疑われる)。
   * `TrialNotification` への予約 INSERT が unique 制約でバッチ全体を冪等にしているため、
   * 500 で EventBridge が最大 24 時間リトライしても送信済みの分が再送されることはない。
   * LAST_DAY 通知は日を跨ぐと二度と送れないため、当日中にリトライで復旧できる可能性を
   * 優先する。500 は同時に `FailedInvocations` アラーム(Task 9)にも乗る。
   *
   * **1 件でも成功していれば部分失敗のまま 200 を返す**:恒久的に届かない宛先が 1 件
   * あるだけで systemic な障害と誤認し、毎日リトライとアラームが出続ける事態を避けるため
   * (個別の失敗は Service 側のログと `failed` フィールドで追える)。
   */
  @Post('trial-reminders')
  @HttpCode(200)
  async runTrialReminders(): Promise<TrialReminderResult> {
    const result = await this.trialReminders.run();

    const sentTotal = result.sent.threeDays + result.sent.lastDay;
    if (result.failed > 0 && sentTotal === 0) {
      throw new InternalServerErrorException(
        `All trial reminder sends failed (failed=${result.failed})`,
      );
    }

    return result;
  }
}
