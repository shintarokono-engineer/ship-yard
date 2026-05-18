import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ADMIN_ROLES, Roles } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationsService } from './invitations.service';

/**
 * メンバー招待(ADR-007、Day 17)。
 *
 * 2 エンドポイントを持つが、認可コンテキストが違うため `@UseGuards` を **メソッド単位** で付ける:
 * - `POST /workspaces/:slug/invitations`: `WorkspaceGuard` + `@Roles(...ADMIN_ROLES)` で OWNER/ADMIN のみ
 * - `POST /invitations/:token/accept`: 認証済みユーザーなら誰でも(token 自体が認可、email 一致は Service で検証)
 *
 * 承諾の GET エンドポイント(招待詳細表示)は Day 18 のオンボーディング UI と一緒に実装する。
 */
@Controller()
@UseGuards(ClerkAuthGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /**
   * 招待作成(OWNER または ADMIN)。
   * - 未所属 / slug 不在 → 404
   * - DEVELOPER 以下のロール → 403(`@Roles(...ADMIN_ROLES)`)
   * - 入力検証エラー(無効 email / OWNER ロール指定) → 400(`CreateInvitationDto`)
   * - 招待トークン作成は成功するが、メール送信失敗時は `body.mailSent = false` をレスポンスに含めて 201 を返す
   *   (ベストエフォート、ADR-007 / `InvitationsService.create` の DocComment 参照)
   */
  @Post('workspaces/:slug/invitations')
  @UseGuards(WorkspaceGuard)
  @Roles(...ADMIN_ROLES)
  create(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitations.create(ws.tenantId, ws.name, ws.userId, dto);
  }

  /**
   * 招待承諾(認証済みユーザーなら誰でも、ただし招待先 email と承諾ユーザーの email が一致する必要あり)。
   * - 招待トークン不在 → 404
   * - 招待期限切れ → 410 Gone
   * - 既に受諾済み → 409 Conflict
   * - email 不一致 → 403 Forbidden
   * - User 未登録(Clerk Webhook 未同期等) → 403 Forbidden
   *
   * 成功時は `{ tenantId, workspaceSlug, workspaceName, role }` を返す。
   * フロントは `workspaceSlug` を使って `/w/{slug}` に遷移する。
   */
  @Post('invitations/:token/accept')
  accept(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    return this.invitations.accept(token, user.clerkUserId);
  }
}
