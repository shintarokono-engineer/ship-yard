import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { Plan, ProjectStatus } from '@shipyard/db';

import type { IdeaValidationService } from '../idea-validation/idea-validation.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ProjectsService } from '../projects/projects.service';
import type { WorkspacesService } from '../workspaces/workspaces.service';
import { PUBLIC_CHECK_CLAIM_STALE_MINUTES } from './public-check.constants';
import { PublicCheckClaimService } from './public-check-claim.service';

const CHECK = {
  id: 'chk_1',
  ideaText: '個人開発者向けのリリース前チェックサービス\n2 行目は名前に使わない',
  claimedByTenantId: null,
  claimedAt: null,
};

function makeService(
  overrides: {
    /** claim 権の取得結果(0 なら既に引き換え済み)。 */
    acquired?: number;
    /** 既に引き換え済みだった場合に、現在ユーザーが所属するテナント。 */
    claimedTenant?: { slug: string } | null;
    claimedByTenantId?: string | null;
    /** 診断起動時に投げる例外。 */
    startValidationError?: Error;
    /** ワークスペース作成時に投げる例外。 */
    createWorkspaceError?: Error;
  } = {},
) {
  const checkUpdateMany = vi.fn().mockResolvedValue({ count: overrides.acquired ?? 1 });
  const checkUpdate = vi.fn().mockResolvedValue({});
  const prisma = {
    publicIdeaCheck: {
      findUnique: vi.fn().mockResolvedValue(CHECK),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ claimedByTenantId: overrides.claimedByTenantId ?? null }),
      updateMany: checkUpdateMany,
      update: checkUpdate,
    },
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'user_1' }) },
    tenant: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ plan: Plan.FREE }),
      findFirst: vi.fn().mockResolvedValue(overrides.claimedTenant ?? null),
    },
  } as unknown as PrismaService;

  const createWorkspace = overrides.createWorkspaceError
    ? vi.fn().mockRejectedValue(overrides.createWorkspaceError)
    : vi.fn().mockResolvedValue({ tenant: { id: 'tenant_1', slug: 'my-workspace' } });
  const workspaces = { create: createWorkspace } as unknown as WorkspacesService;

  const createProject = vi.fn().mockResolvedValue({ id: 'project_1' });
  const projects = { create: createProject } as unknown as ProjectsService;

  const startValidation = overrides.startValidationError
    ? vi.fn().mockRejectedValue(overrides.startValidationError)
    : vi.fn().mockResolvedValue({ jobId: 'job_1' });
  const ideaValidation = { startValidation } as unknown as IdeaValidationService;

  return {
    service: new PublicCheckClaimService(prisma, workspaces, projects, ideaValidation),
    checkUpdateMany,
    checkUpdate,
    createWorkspace,
    createProject,
    startValidation,
  };
}

describe('PublicCheckClaimService.claim', () => {
  it('ワークスペース / Project(IDEA)/ フル診断を作って着地先を返す', async () => {
    const { service, createWorkspace, createProject, startValidation } = makeService();
    const result = await service.claim('clerk_1', 'chk_1');

    expect(createWorkspace).toHaveBeenCalledTimes(1);
    expect(createProject.mock.calls[0]?.[2]).toMatchObject({
      status: ProjectStatus.IDEA,
      description: CHECK.ideaText,
    });
    expect(startValidation).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      workspaceSlug: 'my-workspace',
      projectId: 'project_1',
      jobId: 'job_1',
      alreadyClaimed: false,
    });
  });

  it('プロジェクト名はアイデア文の 1 行目から作る(2 行目以降を混ぜない)', async () => {
    const { service, createProject } = makeService();
    await service.claim('clerk_1', 'chk_1');
    const name = createProject.mock.calls[0]?.[2]?.name as string;
    expect(name).toBe('個人開発者向けのリリース前チェックサービス');
    expect(name).not.toContain('2 行目');
  });

  it('claim 権をワークスペース作成より前に原子的に取る', async () => {
    const { service, checkUpdateMany, createWorkspace } = makeService();
    await service.claim('clerk_1', 'chk_1');

    const where = checkUpdateMany.mock.calls[0]?.[0]?.where;
    expect(where.id).toBe('chk_1');
    expect(where.OR[0]).toEqual({ claimedAt: null });
    expect(checkUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      createWorkspace.mock.invocationCallOrder[0]!,
    );
  });

  it('途中で落ちた claim(テナント未記録)は一定時間後に取り直せる', async () => {
    const { service, checkUpdateMany } = makeService();
    await service.claim('clerk_1', 'chk_1');

    const stale = checkUpdateMany.mock.calls[0]?.[0]?.where.OR[1];
    expect(stale.claimedByTenantId).toBeNull();
    const minutesAgo = (Date.now() - stale.claimedAt.lt.getTime()) / 60_000;
    expect(minutesAgo).toBeCloseTo(PUBLIC_CHECK_CLAIM_STALE_MINUTES, 0);
  });

  it('クレジット不足で診断が起動できなくても claim は成功させる(jobId は null)', async () => {
    const { service, createProject } = makeService({
      startValidationError: new ForbiddenException('AI クレジットの上限に達しました'),
    });
    const result = await service.claim('clerk_1', 'chk_1');

    expect(createProject).toHaveBeenCalledTimes(1);
    expect(result.jobId).toBeNull();
    expect(result.projectId).toBe('project_1');
  });

  it('引き換えたテナント ID を記録する(撤退条件の「転換」判定に使う)', async () => {
    const { service, checkUpdate } = makeService();
    await service.claim('clerk_1', 'chk_1');
    expect(checkUpdate.mock.calls[0]?.[0]?.data).toEqual({ claimedByTenantId: 'tenant_1' });
  });

  it('途中で失敗したら claim 権を解放する(二度と引き換えられなくしない)', async () => {
    const { service, checkUpdateMany } = makeService({
      createWorkspaceError: new Error('stripe down'),
    });

    await expect(service.claim('clerk_1', 'chk_1')).rejects.toThrow('stripe down');
    // 1 回目が取得、2 回目が解放。
    expect(checkUpdateMany).toHaveBeenCalledTimes(2);
    expect(checkUpdateMany.mock.calls[1]?.[0]).toMatchObject({
      where: { id: 'chk_1', claimedByTenantId: null },
      data: { claimedAt: null },
    });
  });

  it('本人の再読み込みは 409 にせずワークスペースへ送る', async () => {
    const { service, createWorkspace } = makeService({
      acquired: 0,
      claimedByTenantId: 'tenant_1',
      claimedTenant: { slug: 'my-workspace' },
    });
    const result = await service.claim('clerk_1', 'chk_1');

    expect(createWorkspace).not.toHaveBeenCalled();
    expect(result).toEqual({
      workspaceSlug: 'my-workspace',
      projectId: null,
      jobId: null,
      alreadyClaimed: true,
    });
  });

  it('他人が引き換え済みなら 409', async () => {
    const { service } = makeService({
      acquired: 0,
      claimedByTenantId: 'tenant_other',
      claimedTenant: null,
    });
    await expect(service.claim('clerk_1', 'chk_1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('結果が存在しなければ 404(ワークスペースを作らない)', async () => {
    const { service, createWorkspace } = makeService();
    const prismaAny = service as unknown as {
      prisma: { publicIdeaCheck: { findUnique: ReturnType<typeof vi.fn> } };
    };
    prismaAny.prisma.publicIdeaCheck.findUnique.mockResolvedValue(null);

    await expect(service.claim('clerk_1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(createWorkspace).not.toHaveBeenCalled();
  });
});
