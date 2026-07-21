import { ForbiddenException } from '@nestjs/common';
import { Feature, Plan } from '@shipyard/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_MODEL_SONNET } from './ai.constants';
import { AIUsageService } from './ai-usage.service';

/**
 * クレジット予約(TOCTOU 回避)の単体テスト。
 * advisory lock と INSERT の原子性(同時実行の直列化)は DB が要るため、ここでは
 * 予約判定ロジック(FREE 403 / 上限超過 403 / 正常時 INSERT)と finalize / release / wrapper を検証する。
 */
describe('AIUsageService credit reservation', () => {
  const proTenant = { id: 'tenant-1', plan: Plan.PRO }; // PRO = 300cr/月
  const usage = { userId: 'user-1', model: AI_MODEL_SONNET, feature: Feature.DRAFT_GEN }; // Sonnet=3cr

  let tx: {
    $executeRaw: ReturnType<typeof vi.fn>;
    aIUsage: { aggregate: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  };
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    aIUsage: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };
  let service: AIUsageService;

  beforeEach(() => {
    tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      aIUsage: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { credits: 0 } }),
        create: vi.fn().mockResolvedValue({ id: 'reservation-1' }),
      },
    };
    prisma = {
      $transaction: vi.fn().mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
      aIUsage: {
        findUnique: vi.fn().mockResolvedValue({ model: AI_MODEL_SONNET }),
        update: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new AIUsageService(prisma as never);
  });

  describe('reserveCredits', () => {
    it('FREE プランは 403(トランザクションに入らない)', async () => {
      await expect(
        service.reserveCredits({ id: 'tenant-1', plan: Plan.FREE }, usage),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('上限内なら advisory lock を取り、予約行を INSERT して id を返す', async () => {
      tx.aIUsage.aggregate.mockResolvedValue({ _sum: { credits: 297 } }); // 297 + 3 = 300 ≦ 300
      const id = await service.reserveCredits(proTenant, usage);
      expect(id).toBe('reservation-1');
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1); // pg_advisory_xact_lock
      expect(tx.aIUsage.create).toHaveBeenCalledTimes(1);
      // 予約行は credits=3(Sonnet)、tokens/costJpy は placeholder(0)。
      expect(tx.aIUsage.create.mock.calls[0]?.[0]?.data).toMatchObject({
        credits: 3,
        tokensIn: 0,
        tokensOut: 0,
      });
    });

    it('当月消費 + 本コール分が上限を超えるなら 403(placeholder は INSERT しない)', async () => {
      tx.aIUsage.aggregate.mockResolvedValue({ _sum: { credits: 298 } }); // 298 + 3 = 301 > 300
      await expect(service.reserveCredits(proTenant, usage)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(tx.aIUsage.create).not.toHaveBeenCalled();
    });
  });

  describe('finalizeReservation / releaseReservation', () => {
    it('finalize は tokens と costJpy を確定する(credits は触らない)', async () => {
      await service.finalizeReservation('reservation-1', { tokensIn: 100, tokensOut: 200 });
      expect(prisma.aIUsage.update).toHaveBeenCalledTimes(1);
      const data = prisma.aIUsage.update.mock.calls[0]?.[0]?.data;
      expect(data).toMatchObject({ tokensIn: 100, tokensOut: 200 });
      expect(data).not.toHaveProperty('credits');
    });

    it('finalize: 予約行が既に無ければ no-op', async () => {
      prisma.aIUsage.findUnique.mockResolvedValue(null);
      await service.finalizeReservation('gone', { tokensIn: 1, tokensOut: 1 });
      expect(prisma.aIUsage.update).not.toHaveBeenCalled();
    });

    it('release は予約行を削除する', async () => {
      await service.releaseReservation('reservation-1');
      expect(prisma.aIUsage.deleteMany).toHaveBeenCalledWith({
        where: { id: 'reservation-1' },
      });
    });
  });

  describe('withCreditReservation', () => {
    it('成功時: run の結果を返し finalize する(release しない)', async () => {
      const result = await service.withCreditReservation(proTenant, usage, async () => ({
        value: 'ok',
        tokensIn: 10,
        tokensOut: 20,
      }));
      expect(result).toBe('ok');
      expect(prisma.aIUsage.update).toHaveBeenCalledTimes(1); // finalize
      expect(prisma.aIUsage.deleteMany).not.toHaveBeenCalled(); // release されない
    });

    it('run が throw したら予約を release して re-throw する', async () => {
      const boom = new Error('AI call failed');
      await expect(
        service.withCreditReservation(proTenant, usage, async () => {
          throw boom;
        }),
      ).rejects.toBe(boom);
      expect(prisma.aIUsage.deleteMany).toHaveBeenCalledTimes(1); // release
      expect(prisma.aIUsage.update).not.toHaveBeenCalled(); // finalize されない
    });
  });
});
