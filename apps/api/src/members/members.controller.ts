import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { MembersService } from './members.service';

/**
 * テナントメンバー管理 API。
 *
 * Guard 戦略:
 * - class-level: `ClerkAuthGuard` + `WorkspaceGuard`(認証 + 所属チェックは全エンドポイント共通)
 * - **`@Roles(...)` は付けない**:詳細な認可(自分自身か / 対象が OWNER か / actor の階層)は
 *   `MembersService` 内で行う。`@Roles(...ADMIN_ROLES)` だけでは「自己退会は誰でも可」
 *   「ADMIN は ADMIN を操作不可」等の条件分岐を表現できないため
 */
@Controller('workspaces/:slug/members')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  /**
   * GET /workspaces/:slug/members — メンバー一覧(TenantMember 全員が閲覧可)。
   * ロール優先順(OWNER → ADMIN → ...) → joinedAt 昇順で並び、各メンバーに User 情報(name / email / image)を join。
   */
  @Get()
  list(@CurrentWorkspace() ws: WorkspaceAccess) {
    return this.members.list(ws.tenantId);
  }

  /**
   * PATCH /workspaces/:slug/members/:userId — ロール変更。
   * 認可は `MembersService.updateRole` で詳細判定(自分のロール変更不可 / OWNER 不可 / ADMIN→ADMIN 不可)。
   * - 認可違反 → 403
   * - 対象が未存在 → 404
   * - DTO 検証エラー(OWNER 指定 / 未知ロール) → 400
   */
  @Patch(':userId')
  updateRole(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.members.updateRole(
      ws.tenantId,
      { userId: ws.userId, role: ws.role },
      targetUserId,
      dto.role,
    );
  }

  /**
   * DELETE /workspaces/:slug/members/:userId — メンバー削除(自己退会も同経路)。
   * 204 を返す。認可は `MembersService.remove` で詳細判定:
   * - 対象 = OWNER → 403(自己退会 / 他者削除いずれも不可、所有権譲渡が必要)
   * - 対象 = 自分 → 許可(OWNER 以外、ロール不問の退会)
   * - 対象 = 他人 → OWNER/ADMIN のみ可、ADMIN→ADMIN は不可
   * - 対象が未存在 → 404
   */
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('userId') targetUserId: string,
  ): Promise<void> {
    await this.members.remove(ws.tenantId, { userId: ws.userId, role: ws.role }, targetUserId);
  }
}
