import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@shipyard/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MembersService } from './members.service';

/**
 * `transferOwnership` の認可・バリデーション分岐の単体テスト。
 * トランザクションの実挙動(3 つの UPDATE の原子性)は DB が要るため e2e で確認する。
 */
describe('MembersService.transferOwnership', () => {
  const tenantId = 'tenant-1';
  const owner = { userId: 'user-owner', role: Role.OWNER };

  let prisma: {
    tenantMember: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    tenant: { update: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let billing: { syncSubscriptionQuantity: ReturnType<typeof vi.fn> };
  let service: MembersService;

  beforeEach(() => {
    prisma = {
      tenantMember: {
        findUnique: vi.fn(),
        update: vi.fn().mockReturnValue({ __op: 'member.update' }),
      },
      tenant: { update: vi.fn().mockReturnValue({ __op: 'tenant.update' }) },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    billing = { syncSubscriptionQuantity: vi.fn() };
    // Prisma / Billing はメソッド呼び出しのみを検証するため部分モックで注入する。
    service = new MembersService(prisma as never, billing as never);
  });

  it('actor が OWNER でなければ 403', async () => {
    await expect(
      service.transferOwnership(tenantId, { userId: 'user-admin', role: Role.ADMIN }, 'user-x'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tenantMember.findUnique).not.toHaveBeenCalled();
  });

  it('対象が自分自身なら 400', async () => {
    await expect(
      service.transferOwnership(tenantId, owner, owner.userId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('対象が非メンバーなら 404', async () => {
    prisma.tenantMember.findUnique.mockResolvedValue(null);
    await expect(
      service.transferOwnership(tenantId, owner, 'user-ghost'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('対象が論理削除済み User なら 404', async () => {
    prisma.tenantMember.findUnique.mockResolvedValue({ user: { deletedAt: new Date() } });
    await expect(
      service.transferOwnership(tenantId, owner, 'user-deleted'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('正常系: 譲渡を実行し、seat 同期は呼ばない(seat 数不変)', async () => {
    prisma.tenantMember.findUnique.mockResolvedValue({ user: { deletedAt: null } });

    const result = await service.transferOwnership(tenantId, owner, 'user-target');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // トランザクションには 3 つの操作(tenant.update + member×2)が渡る。
    const ops = (prisma.$transaction.mock.calls[0]?.[0] ?? []) as unknown[];
    expect(ops).toHaveLength(3);
    expect(billing.syncSubscriptionQuantity).not.toHaveBeenCalled();
    expect(result).toEqual({
      newOwnerUserId: 'user-target',
      previousOwner: { userId: owner.userId, role: Role.ADMIN },
    });
  });
});
