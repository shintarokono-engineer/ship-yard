import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { render } from '@react-email/render';
import { createElement } from 'react';
import { Resend } from 'resend';

import { dayjs } from '../common/time';
import { InvitationEmail } from './emails/invitation-email';

/** `MailService.sendInvitation` の引数(InvitationsService から渡す)。 */
export interface SendInvitationInput {
  /** 招待先メールアドレス */
  to: string;
  /** 招待リンク用トークン(URL に埋め込む、`InvitationToken.token`) */
  token: string;
  /** ワークスペース名(本文に表示) */
  workspaceName: string;
  /** 招待者の表示名(User.name、null なら email を渡してもよい) */
  inviterName: string;
  /** 付与ロールの日本語ラベル(例: 「開発者(DEVELOPER)」) */
  roleLabel: string;
  /** 有効期限(`InvitationToken.expiresAt`) */
  expiresAt: Date;
}

/**
 * メール送信基盤の薄抽象(ADR-007、Day 17)。MVP は Resend、将来 SES への差し替え可能。
 *
 * **抽象度の判断(機能特化)**:
 * 汎用 `send(...)` ではなく `sendInvitation(...)` のような機能特化メソッドにしている。
 * - 上位レイヤ(InvitationsService)が HTML 文字列を組み立てる責務を持たずに済む
 * - テンプレート(React Email コンポーネント)とメール送信の両方を MailService 内に閉じ込められる
 * - 将来 課金通知 / パスワードリセット補助 を追加するときは `sendBillingNotification(...)` 等を足す
 *
 * **失敗時の挙動(ベストエフォート、ADR-007)**:
 * 例外を上にスローする。InvitationsService 側で try/catch して、招待トークン作成 自体は成功扱いで
 * `mailSent: false` をレスポンスに含める方針(DB トランザクションに外部 I/O を含めない、PG ベスプラ)。
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  /** From アドレス(`Display Name <email@domain>` 形式可)。`MAIL_FROM` から取得。 */
  private readonly from: string;
  /** 招待リンクのベース URL(`APP_BASE_URL` から取得、Checkout と共用)。 */
  private readonly appBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY'));
    this.from = this.config.getOrThrow<string>('MAIL_FROM');
    this.appBaseUrl = this.config.getOrThrow<string>('APP_BASE_URL');
  }

  async sendInvitation(input: SendInvitationInput): Promise<void> {
    const inviteUrl = `${this.appBaseUrl}/invite/${input.token}`;
    // dayjs UTC 拡張で「日本時間 YYYY/MM/DD HH:mm」形式に整形(ユーザーが分かりやすい表記)
    const expiresAtLabel = dayjs(input.expiresAt).format('YYYY/MM/DD HH:mm');

    // `@react-email/render` は React 要素を受け取るので、`InvitationEmail({...})` の関数直接呼び出しではなく `createElement(InvitationEmail, {...})` で React 要素を作って渡す。
    // mail.service.ts は .tsx ではないので JSX 構文(`<InvitationEmail .../>`)が使えないため createElement を使う。
    const html = await render(
      createElement(InvitationEmail, {
        workspaceName: input.workspaceName,
        inviterName: input.inviterName,
        roleLabel: input.roleLabel,
        inviteUrl,
        expiresAtLabel,
      }),
    );

    // 【Resend SDK 呼び出し】Resend REST API へ HTTP POST。失敗時は例外が上にスローされる。
    // 上位 (InvitationsService) でベストエフォートとして try/catch する設計(ADR-007)。
    const result = await this.resend.emails.send({
      from: this.from,
      to: input.to,
      subject: `${input.workspaceName} への招待が届きました`,
      html,
    });

    // Resend SDK は HTTP 200 だが `{ error: {...} }` でビジネスエラーを返すパターンがあるため、
    // result.error を確認して例外に変換(SDK 自体は throw しない場合への二重防御)。
    if (result.error) {
      const msg = `Resend send failed: ${result.error.name} - ${result.error.message}`;
      this.logger.error(msg);
      throw new Error(msg);
    }
    this.logger.log(`Invitation email sent to ${input.to} (id=${result.data?.id ?? 'unknown'})`);
  }
}
