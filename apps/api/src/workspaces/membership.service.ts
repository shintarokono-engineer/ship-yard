import { Injectable } from '@nestjs/common';

import type { Plan, Role } from '@shipyard/db';

import { PrismaService } from '../prisma/prisma.service';

/** slug のテナントに対する、ある Clerk ユーザーのアクセス情報。 */
export interface WorkspaceAccess {
  /** テナント内部 ID。 */
  tenantId: string;
  /** ワークスペース表示名。 */
  name: string;
  /** 現在のプラン(Free 上限判定などに使う)。 */
  plan: Plan;
  /** このユーザーのロール。 */
  role: Role;
  /** 内部 User ID(ProjectDocument.createdById 等で使う)。 */
  userId: string;
}

/**
 * 「Clerk ユーザーが slug のテナントに所属しているか」を解決する共通サービス。
 * 所属していない / slug 不在 / User 未登録 のいずれも `null` を返す(呼び出し側で 404 にする — 存在の有無を漏らさない、ADR-003)。
 *
 * テナントの追加フィールド(owner / メンバー数 等)が要る場合は、戻り値の `tenantId` で別途 `prisma.tenant.findUnique` する。
 */
@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAccess(slug: string, clerkUserId: string): Promise<WorkspaceAccess | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, plan: true },
    });
    if (!tenant) return null;

    // §9.10 Clerk webhook(Day 49):論理削除済みユーザー(`deletedAt` セット済)は JWT 有効期間中も
    // 全テナント API から弾く。`findFirst` で複合 where を使う(`clerkUserId` ユニーク制約 + 1 行のみで実害なし)。
    const dbUser = await this.prisma.user.findFirst({
      where: { clerkUserId, deletedAt: null },
      select: { id: true },
    });
    if (!dbUser) return null;

    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: dbUser.id } },
      select: { role: true },
    });
    if (!member) return null;

    return {
      tenantId: tenant.id,
      name: tenant.name,
      plan: tenant.plan,
      role: member.role,
      userId: dbUser.id,
    };
  }
}
