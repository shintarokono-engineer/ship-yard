import { Controller, Get, Param } from '@nestjs/common';

import { InvitationsService } from './invitations.service';

/**
 * 未認証で叩ける招待 API。サインアップ前のユーザーが「自分が何の招待を受けたか」を確認できるよう、
 * GET /invitations/:token は guard を付けない別 controller に分離している。
 *
 * セキュリティ:
 * - token は 256-bit cryptographic random(`randomBytes(32).toString('base64url')`)で
 *   推測困難。token を持つ = 招待リンクを知っている = 招待先メール所有者相当の認可とみなす
 * - 漏洩した場合の乗っ取り(誤承諾)は `POST /invitations/:token/accept` 側の
 *   `User.email === invitation.email` 検証で防いでいるため、本ルートでの情報露出は限定的
 * - Notion / Slack / GitHub / Vercel など主要 SaaS と同じパターン
 */
@Controller()
export class PublicInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /**
   * 招待詳細(未認証可)。期限切れ・取り消し済みも `status` フィールドで弁別して 200 を返し、
   * フロント側で表示分岐(承諾ボタン / 期限切れメッセージ / 取り消し済みメッセージ)。
   * - 不在のみ 404(token 推測攻撃の手がかりを与えない)
   */
  @Get('invitations/:token')
  findDetail(@Param('token') token: string) {
    return this.invitations.findDetail(token);
  }
}
