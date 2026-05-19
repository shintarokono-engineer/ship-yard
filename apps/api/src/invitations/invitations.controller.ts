import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

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
 * メンバー招待(ADR-007、認証必須ルート)。
 *
 * 認可コンテキストが違うため `@UseGuards` を **メソッド単位** で付ける:
 * - `/workspaces/:slug/invitations` 配下: `WorkspaceGuard` + `@Roles(...ADMIN_ROLES)` で OWNER/ADMIN のみ
 * - `POST /invitations/:token/accept`: 認証済みユーザーなら誰でも(token 自体が認可、email 一致は Service で検証)
 *
 * 詳細表示の GET `/invitations/:token` は未認証で叩けるため `PublicInvitationsController` に分離している。
 */
@Controller()
@UseGuards(ClerkAuthGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /**
   * 招待作成(OWNER または ADMIN)。
   * - 未所属 / slug 不在 → 404
   * - DEVELOPER 以下のロール → 403
   * - 入力検証エラー(無効 email / OWNER ロール指定) → 400
   * - 招待トークン作成は成功するが、メール送信失敗時は `body.mailSent = false` をレスポンスに含めて 201 を返す
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
   * 招待一覧(OWNER または ADMIN)。受諾済み / 取り消し済み / 期限切れも含めて返し、
   * `status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'` でフロント側がタブ切り替え。
   */
  @Get('workspaces/:slug/invitations')
  @UseGuards(WorkspaceGuard)
  @Roles(...ADMIN_ROLES)
  list(@CurrentWorkspace() ws: WorkspaceAccess) {
    return this.invitations.list(ws.tenantId);
  }

  /**
   * 招待取り消し(OWNER または ADMIN)。論理削除(revokedAt セット)で履歴を残す。
   * - 別テナントの招待 ID / 未存在 → 404
   * - 受諾済み / 取り消し済み → 409
   */
  @Delete('workspaces/:slug/invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(WorkspaceGuard)
  @Roles(...ADMIN_ROLES)
  async revoke(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('id') invitationId: string,
  ): Promise<void> {
    await this.invitations.revoke(ws.tenantId, invitationId);
  }

  /**
   * 招待再送(OWNER または ADMIN)。既存 token を revoke し、新 token + expiresAt 7 日で再発行 + メール送信。
   * - 別テナント / 未存在 → 404
   * - 受諾済み / 取り消し済み → 409
   * - 期限切れの招待は再送で復活させる想定(新規発行扱い)
   */
  @Post('workspaces/:slug/invitations/:id/resend')
  @UseGuards(WorkspaceGuard)
  @Roles(...ADMIN_ROLES)
  resend(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('id') invitationId: string,
  ) {
    return this.invitations.resend(ws.tenantId, invitationId, ws.name, ws.userId);
  }

  /**
   * 招待承諾(認証済みユーザーなら誰でも、ただし招待先 email と承諾ユーザーの email が一致する必要あり)。
   * - 招待トークン不在 → 404
   * - 取り消し済み / 期限切れ → 410 Gone
   * - 既に受諾済み → 409 Conflict
   * - email 不一致 / User 未登録 → 403 Forbidden
   */
  @Post('invitations/:token/accept')
  accept(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    return this.invitations.accept(token, user.clerkUserId);
  }
}
