import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import {
  PUBLIC_CHECK_IP_HASH_RETENTION_HOURS,
  PUBLIC_CHECK_RETENTION_DAYS,
} from './public-check.constants';
import { PublicCheckPurgeService } from './public-check-purge.service';

function makeService() {
  const deleteMany = vi.fn().mockResolvedValue({ count: 3 });
  const updateMany = vi.fn().mockResolvedValue({ count: 7 });
  const prisma = {
    publicIdeaCheck: { deleteMany, updateMany },
  } as unknown as PrismaService;
  return { service: new PublicCheckPurgeService(prisma), deleteMany, updateMany };
}

/** `Date` を「今から何日前か」に直す。 */
function daysAgo(date: Date): number {
  return (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
}

describe('PublicCheckPurgeService.run', () => {
  it('未共有かつ保持期間を過ぎたものだけを削除する', async () => {
    const { service, deleteMany } = makeService();
    await service.run();

    // `sharedAt: null` が消えると共有済みの結果まで削除される。
    const where = deleteMany.mock.calls[0]?.[0]?.where;
    expect(where.sharedAt).toBeNull();
    expect(daysAgo(where.createdAt.lt)).toBeCloseTo(PUBLIC_CHECK_RETENTION_DAYS, 1);
  });

  it('claim 済みかどうかで削除対象を分けない(アイデア文は Project へ複製済み)', async () => {
    const { service, deleteMany } = makeService();
    await service.run();
    expect(deleteMany.mock.calls[0]?.[0]?.where).not.toHaveProperty('claimedAt');
    expect(deleteMany.mock.calls[0]?.[0]?.where).not.toHaveProperty('claimedByTenantId');
  });

  it('レート制限の窓を過ぎた ipHash を null にする', async () => {
    const { service, updateMany } = makeService();
    await service.run();

    const call = updateMany.mock.calls[0]?.[0];
    expect(call.data).toEqual({ ipHash: null });
    expect(call.where.ipHash).toEqual({ not: null });
    expect(daysAgo(call.where.createdAt.lt) * 24).toBeCloseTo(
      PUBLIC_CHECK_IP_HASH_RETENTION_HOURS,
      1,
    );
  });

  it('削除を ipHash の更新より先に実行する(これから消す行を無駄に更新しない)', async () => {
    const { service, deleteMany, updateMany } = makeService();
    await service.run();
    expect(deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      updateMany.mock.invocationCallOrder[0]!,
    );
  });

  it('件数を返す(EventBridge のログから効いているか追えるように)', async () => {
    const { service } = makeService();
    expect(await service.run()).toEqual({ deleted: 3, ipHashCleared: 7 });
  });
});
