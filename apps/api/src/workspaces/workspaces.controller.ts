import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { Role } from '@shipyard/db';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { BillingService } from '../billing/billing.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import type { WorkspaceAccess } from './membership.service';

/**
 * ワークスペース(テナント)の参照 + 課金操作 API。
 * - apps/web の /w/[slug] ページが所属チェックに使う(ADR-002 / ADR-003)
 * - プラン変更(Checkout)は OWNER のみ(`@Roles(Role.OWNER)`、ADR-004 / Role 定義)
 *
 * 認証 → 所属解決 → ロール検証は `ClerkAuthGuard` → `WorkspaceGuard` が担い、解決済みの所属情報は `@CurrentWorkspace()` で受け取る
 * (slug は path の `:slug` をそのまま `@Param` で受ける — `WorkspaceGuard` が解決に使うのと同じ値)。
 */
@Controller('workspaces')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class WorkspacesController {
  constructor(private readonly billing: BillingService) {}

  /**
   * GET /workspaces/:slug
   * - slug が存在しない / 現在のユーザーが TenantMember でない → 404(`WorkspaceGuard`、ADR-003)
   * - 所属している → { id, slug, name, plan, role }
   */
  @Get(':slug')
  getWorkspace(@CurrentWorkspace() ws: WorkspaceAccess, @Param('slug') slug: string) {
    return {
      id: ws.tenantId,
      slug,
      name: ws.name,
      plan: ws.plan,
      role: ws.role,
    };
  }

  /**
   * POST /workspaces/:slug/checkout-session
   * 指定プラン(PRO / TEAM)の Stripe Checkout Session を作り、リダイレクト先 URL を返す。
   * - 未所属 / slug 不在 → 404
   * - OWNER 以外 → 403(`@Roles(Role.OWNER)`、ADR-004 / Role 定義)
   * - plan が PRO / TEAM 以外 → 400(`CreateCheckoutSessionDto`)
   */
  @Post(':slug/checkout-session')
  @Roles(Role.OWNER)
  createCheckoutSession(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('slug') slug: string,
    @Body() dto: CreateCheckoutSessionDto,
  ): Promise<{ url: string }> {
    return this.billing.createCheckoutSession({
      tenantId: ws.tenantId,
      slug,
      name: ws.name,
      plan: dto.plan,
    });
  }
}
