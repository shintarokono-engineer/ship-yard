import { Feature } from '@shipyard/db';
import { describe, expect, it, vi } from 'vitest';

import { AI_JOB_STALE_MS } from './ai.constants';
import { AiJobService } from './ai-job.service';
import type { AIUsageService } from './ai-usage.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * `AiJobService` のテスト(ADR-017)。
 *
 * 守りたいのは「取り残し」 の扱い。App Runner が再起動すると背景処理ごと消えるが `status` は
 * RUNNING のまま残り、**クレジット予約行も残ってユーザーの当月枠を食う**。同期実行では
 * 起こり得なかった経路なので、ここが壊れると気付けないまま課金だけが残る。
 */
function makeService(overrides: {
  job?: unknown;
  jobs?: unknown[];
  release?: ReturnType<typeof vi.fn>;
  updateMany?: ReturnType<typeof vi.fn>;
}) {
  const updateMany = overrides.updateMany ?? vi.fn().mockResolvedValue({ count: 1 });
  const releaseReservation = overrides.release ?? vi.fn().mockResolvedValue(undefined);
  const prisma = {
    aiJob: {
      findFirst: vi.fn().mockResolvedValue(overrides.job ?? null),
      findMany: vi.fn().mockResolvedValue(overrides.jobs ?? []),
      create: vi.fn().mockResolvedValue({ id: 'job_1' }),
      updateMany,
    },
  } as unknown as PrismaService;
  const aiUsage = { releaseReservation } as unknown as AIUsageService;
  return { service: new AiJobService(prisma, aiUsage), updateMany, releaseReservation, prisma };
}

/** RUNNING のジョブ 1 件。`ageMs` だけ前に更新されたことにする。 */
function runningJob(ageMs: number, reservationId: string | null = 'res_1') {
  const updatedAt = new Date(Date.now() - ageMs);
  return {
    id: 'job_1',
    status: 'RUNNING' as const,
    resultId: null,
    errorMessage: null,
    createdAt: updatedAt,
    updatedAt,
    reservationId,
  };
}

describe('AiJobService.get', () => {
  it('存在しなければ null', async () => {
    const { service } = makeService({ job: null });
    expect(await service.get('t1', 'p1', 'job_1')).toBeNull();
  });

  it('新しい RUNNING はそのまま返す(取り残し扱いにしない)', async () => {
    const { service, releaseReservation, updateMany } = makeService({ job: runningJob(1000) });
    const view = await service.get('t1', 'p1', 'job_1');
    expect(view?.status).toBe('RUNNING');
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('古い RUNNING は FAILED に倒し、クレジット予約を解放する', async () => {
    const { service, releaseReservation, updateMany } = makeService({
      job: runningJob(AI_JOB_STALE_MS + 1000),
    });
    const view = await service.get('t1', 'p1', 'job_1');

    expect(view?.status).toBe('FAILED');
    expect(releaseReservation).toHaveBeenCalledWith('res_1');
    // 二重解放を防ぐため reservationId を null に戻している
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reservationId: null }) }),
    );
  });

  it('取り残しの文言はクレジットについて断定しない', async () => {
    // 予約解放に失敗する可能性があるため「消費されていません」 と言い切らない(実際に誤りだった)
    const { service } = makeService({ job: runningJob(AI_JOB_STALE_MS + 1000) });
    const view = await service.get('t1', 'p1', 'job_1');
    expect(view?.errorMessage).not.toContain('クレジット');
  });

  it('予約解放が失敗しても FAILED 化は進める', async () => {
    const { service, updateMany } = makeService({
      job: runningJob(AI_JOB_STALE_MS + 1000),
      release: vi.fn().mockRejectedValue(new Error('db down')),
    });
    const view = await service.get('t1', 'p1', 'job_1');
    expect(view?.status).toBe('FAILED');
    expect(updateMany).toHaveBeenCalled();
  });

  it('予約 ID が無ければ解放を呼ばない', async () => {
    const { service, releaseReservation } = makeService({
      job: runningJob(AI_JOB_STALE_MS + 1000, null),
    });
    await service.get('t1', 'p1', 'job_1');
    expect(releaseReservation).not.toHaveBeenCalled();
  });
});

describe('AiJobService.listActive', () => {
  it('古い RUNNING は FAILED として返す', async () => {
    const { service, releaseReservation } = makeService({
      jobs: [runningJob(AI_JOB_STALE_MS + 1000)],
    });
    const views = await service.listActive('t1', 'p1', Feature.PRODUCT_DIAGNOSIS);
    expect(views).toHaveLength(1);
    expect(views[0]?.status).toBe('FAILED');
    expect(releaseReservation).toHaveBeenCalledWith('res_1');
  });

  it('DONE は問い合わせ対象に含めない(結果本体が一覧に出るため)', async () => {
    const { service, prisma } = makeService({ jobs: [] });
    await service.listActive('t1', 'p1', Feature.PRODUCT_DIAGNOSIS);
    const where = vi.mocked(prisma.aiJob.findMany).mock.calls[0]?.[0]?.where;
    const statuses = JSON.stringify(where);
    expect(statuses).toContain('RUNNING');
    expect(statuses).toContain('FAILED');
    expect(statuses).not.toContain('DONE');
  });
});

describe('AiJobService.findRunning', () => {
  it('多重実行の抑止に使うため RUNNING だけを引く', async () => {
    const { service, prisma } = makeService({ job: { id: 'job_1' } });
    const found = await service.findRunning('t1', 'p1', Feature.IDEA_VALIDATION);
    expect(found).toEqual({ id: 'job_1' });
    expect(vi.mocked(prisma.aiJob.findFirst).mock.calls[0]?.[0]?.where).toMatchObject({
      status: 'RUNNING',
      feature: Feature.IDEA_VALIDATION,
    });
  });
});
