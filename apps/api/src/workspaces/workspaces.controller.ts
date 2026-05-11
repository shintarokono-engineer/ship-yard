import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ワークスペース(テナント)の参照 API。
 * apps/web の /w/[slug] ページが「現在のユーザーがその slug のテナントに所属しているか」を
 * 確認するために呼ぶ(ADR-002 / ADR-003)。
 */
@Controller('workspaces')
@UseGuards(ClerkAuthGuard)
export class WorkspacesController {
  constructor(private readonly prisma: PrismaService) {}

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

    const dbUser = await this.prisma.user.findUnique({
      where: { clerkUserId: user.clerkUserId },
      select: { id: true },
    });
    const member = dbUser
      ? await this.prisma.tenantMember.findUnique({
          where: { tenantId_userId: { tenantId: tenant.id, userId: dbUser.id } },
          select: { role: true },
        })
      : null;
    if (!member) {
      throw new NotFoundException();
    }

    return { ...tenant, role: member.role };
  }
}
