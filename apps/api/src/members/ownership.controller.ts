import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import { Role } from '@shipyard/db';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { MembersService } from './members.service';

/**
 * 所有権譲渡 API(ADR-007)。members とは別 URL(`workspaces/:slug/transfer-ownership`)のため
 * MembersController(`workspaces/:slug/members`)から分離する。ロジックは `MembersService` に集約。
 *
 * Guard: class-level で認証 + 所属チェック、handler で `@Roles(OWNER)`。詳細判定は Service 内。
 */
@Controller('workspaces/:slug')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class OwnershipController {
  constructor(private readonly members: MembersService) {}

  /**
   * POST /workspaces/:slug/transfer-ownership — 所有権を別メンバーへ譲渡(現 OWNER のみ)。
   * - 非 OWNER → 403(`@Roles(OWNER)` + Service 内チェック)
   * - 対象 = 自分 → 400 / 対象が非メンバー or 論理削除済み → 404
   * 旧 OWNER は ADMIN に降格、対象が新 OWNER。200 で譲渡後の状態を返す。
   */
  @Post('transfer-ownership')
  @Roles(Role.OWNER)
  @HttpCode(HttpStatus.OK)
  transferOwnership(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.members.transferOwnership(
      ws.tenantId,
      { userId: ws.userId, role: ws.role },
      dto.targetUserId,
    );
  }
}
