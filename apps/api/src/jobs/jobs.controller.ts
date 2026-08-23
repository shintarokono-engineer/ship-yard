import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';

import { InternalJobGuard } from './internal-job.guard';
import { TrialReminderService, type TrialReminderResult } from './trial-reminder.service';

/**
 * 内部ジョブの受け口(F20 / 将来の F15 Reconciliation)。
 *
 * EventBridge Rule + API destination から日次で叩かれる。`TenantMiddleware` は
 * `X-Tenant-Slug` の無いリクエストを素通しするため、テナント無しで通過する(webhook と同じ経路)。
 */
@Controller('internal/jobs')
@UseGuards(InternalJobGuard)
export class JobsController {
  constructor(private readonly trialReminders: TrialReminderService) {}

  /**
   * トライアル終了通知バッチを実行する。
   *
   * **個別の送信が全件失敗しても 200 を返す**:500 を返すと EventBridge が最大 24 時間
   * リトライし、成功済みの分を再送するリスクを生むため。500 は DB 接続断など処理自体を
   * 開始できなかった場合(= 例外が Service から抜けてきた場合)に限られる。
   */
  @Post('trial-reminders')
  @HttpCode(200)
  async runTrialReminders(): Promise<TrialReminderResult> {
    return this.trialReminders.run();
  }
}
