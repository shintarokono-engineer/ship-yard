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

/** Checkout 作成リクエストのボディ */
interface CreateCheckoutBody {
  plan?: string;
}

/**
 * ワークスペース(テナント)の参照 + 課金操作 API。
 * - apps/web の /w/[slug] ページが所属チェックに使う(ADR-002 / ADR-003)
 * - プラン変更(Checkout)は OWNER のみ(Role 定義: プラン変更権限は OWNER のみ)
 */
@Controller('workspaces')
@UseGuards(ClerkAuthGuard)
export class WorkspacesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /**
   * GET /workspaces/:slug
   * - slug が存在しない → 404
   * - 現在のユーザーがそのテナントの TenantMember でない → 404(存在の有無を漏らさない、ADR-003)
   * - 所属している → { id, slug, name, plan, role }
   */
  @Get(':slug')
  async getWorkspace(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, plan: true },
    });
    if (!tenant) {
      throw new NotFoundException();
    }

    const member = await this.findMembership(tenant.id, user.clerkUserId);
    if (!member) {
      throw new NotFoundException();
    }

    return { ...tenant, role: member.role };
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

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        owner: { select: { email: true, name: true } },
        _count: { select: { members: true } },
      },
    });
    if (!tenant) {
      throw new NotFoundException();
    }

    const member = await this.findMembership(tenant.id, user.clerkUserId);
    if (!member) {
      throw new NotFoundException();
    }
    if (member.role !== Role.OWNER) {
      throw new ForbiddenException('Only the workspace owner can change the plan');
    }

    return this.billing.createCheckoutSession({
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, owner: tenant.owner },
      plan,
      quantity: tenant._count.members,
    });
  }

  /** clerkUserId 経由で TenantMember を引く(所属していなければ null)。 */
  private async findMembership(tenantId: string, clerkUserId: string) {
    const dbUser = await this.prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true },
    });
    if (!dbUser) return null;
    return this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId: dbUser.id } },
      select: { role: true },
    });
  }
}
