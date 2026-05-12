import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Plan, Role } from '@shipyard/db';

import type { AuthUser } from '../auth/auth-user';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipService } from './membership.service';

/** Checkout 作成リクエストのボディ */
interface CreateCheckoutBody {
  plan?: string;
}

/**
 * ワークスペース(テナント)の参照 + 課金操作 API。
 * - apps/web の /w/[slug] ページが所属チェックに使う(ADR-002 / ADR-003)
 * - プラン変更(Checkout)は OWNER のみ(Role 定義: プラン変更権限は OWNER のみ)
 *
 * 所属チェックは `MembershipService.resolveAccess` に共通化(DraftGenController 等でも同じものを使う)。
 */
@Controller('workspaces')
@UseGuards(ClerkAuthGuard)
export class WorkspacesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly membership: MembershipService,
  ) {}

  /**
   * GET /workspaces/:slug
   * - slug が存在しない / 現在のユーザーが TenantMember でない → 404(存在の有無を漏らさない、ADR-003)
   * - 所属している → { id, slug, name, plan, role }
   */
  @Get(':slug')
  async getWorkspace(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    const access = await this.membership.resolveAccess(slug, user.clerkUserId);
    if (!access) {
      throw new NotFoundException();
    }
    return {
      id: access.tenantId,
      slug,
      name: access.name,
      plan: access.plan,
      role: access.role,
    };
  }

  /**
   * POST /workspaces/:slug/checkout-session
   * 指定プラン(PRO / TEAM)の Stripe Checkout Session を作り、リダイレクト先 URL を返す。
   * - 未所属 / slug 不在 → 404
   * - OWNER 以外 → 403(プラン変更は OWNER のみ、ADR-004 / Role 定義)
   * - plan が PRO / TEAM 以外 → 400
   */
  @Post(':slug/checkout-session')
  async createCheckoutSession(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CreateCheckoutBody,
  ): Promise<{ url: string }> {
    const plan = body?.plan;
    if (plan !== Plan.PRO && plan !== Plan.TEAM) {
      throw new BadRequestException(`plan must be "${Plan.PRO}" or "${Plan.TEAM}"`);
    }

    const access = await this.membership.resolveAccess(slug, user.clerkUserId);
    if (!access) {
      throw new NotFoundException();
    }
    if (access.role !== Role.OWNER) {
      throw new ForbiddenException('Only the workspace owner can change the plan');
    }

    // Checkout には owner の連絡先と現メンバー数(TEAM の quantity)が要るので、それだけ追加で取る。
    const extra = await this.prisma.tenant.findUnique({
      where: { id: access.tenantId },
      select: {
        owner: { select: { email: true, name: true } },
        _count: { select: { members: true } },
      },
    });
    if (!extra) {
      throw new NotFoundException();
    }

    return this.billing.createCheckoutSession({
      tenant: { id: access.tenantId, slug, name: access.name, owner: extra.owner },
      plan,
      quantity: extra._count.members,
    });
  }
}
