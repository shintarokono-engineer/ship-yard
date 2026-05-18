import { Global, Module } from '@nestjs/common';

import { MailService } from './mail.service';

/**
 * メール送信基盤(Resend、ADR-007)。アプリ全体で利用可能にするグローバル Module。
 *
 * Day 17 で導入。当初は招待メール(`MailService.sendInvitation`)のみだが、
 * 将来 課金通知 / パスワードリセット補助 等を追加するときは MailService にメソッドを足す。
 *
 * プロバイダ差し替え(Resend → AWS SES)は ADR-007 の「フォローアップ」参照。
 * 本 Module は MailService を export しているだけなので、Service 実装を入れ替えるだけで完了する。
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
