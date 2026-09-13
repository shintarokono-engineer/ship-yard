import { describe, expect, it, vi } from 'vitest';

import type { ConfigService } from '@nestjs/config';

import type { AnthropicService } from '../ai/shared/anthropic.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  PUBLIC_CHECK_DAILY_LIMIT,
  PUBLIC_CHECK_IP_RATE_LIMIT,
  PUBLIC_CHECK_MAX_TOKENS,
} from './public-check.constants';
import { PublicCheckDailyLimitError, PublicCheckIpRateLimitError } from './public-check.errors';
import { PublicCheckService } from './public-check.service';
import { PUBLIC_CHECK_AXES } from '../idea-validation/validation.constants';

function validToolResponse() {
  return {
    model: 'claude-haiku-4-5-20251001',
    usage: { input_tokens: 3200, output_tokens: 1700 },
    content: [
      {
        type: 'tool_use' as const,
        id: 'toolu_1',
        name: 'submit_idea_validation',
        input: {
          totalScore: 36,
          breakdown: Object.fromEntries(
            PUBLIC_CHECK_AXES.map((axis) => [axis, { score: 12, comment: `${axis} の根拠` }]),
          ),
          suggestions: [
            { priority: 'HIGH', title: '提案 1', body: '本文 1', axis: 'problemClarity' },
            { priority: 'MEDIUM', title: '提案 2', body: '本文 2', axis: 'targetClarity' },
            { priority: 'LOW', title: '提案 3', body: '本文 3', axis: 'differentiation' },
          ],
        },
      },
    ],
  };
}

function makeService(
  overrides: {
    /** `updateMany` が返す件数。0 なら日次上限に到達している状態。 */
    quotaUpdated?: number;
    /** 直近の窓に存在する同一 IP の実行件数。 */
    recentByIp?: number;
    /** Anthropic の応答(未指定なら正常応答)。 */
    create?: ReturnType<typeof vi.fn>;
    /** ソルト(未指定なら設定済み)。 */
    salt?: string | undefined;
  } = {},
) {
  const usageUpsert = vi.fn().mockResolvedValue({});
  const usageUpdateMany = vi.fn().mockResolvedValue({ count: overrides.quotaUpdated ?? 1 });
  const checkCount = vi.fn().mockResolvedValue(overrides.recentByIp ?? 0);
  const checkCreate = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
  const messagesCreate = overrides.create ?? vi.fn().mockResolvedValue(validToolResponse());

  const prisma = {
    publicCheckUsage: { upsert: usageUpsert, updateMany: usageUpdateMany },
    publicIdeaCheck: {
      count: checkCount,
      create: checkCreate,
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  } as unknown as PrismaService;
  const anthropic = {
    client: { messages: { create: messagesCreate } },
  } as unknown as AnthropicService;
  const config = {
    get: vi.fn().mockReturnValue('salt' in overrides ? overrides.salt : 'test-salt'),
  } as unknown as ConfigService;

  return {
    service: new PublicCheckService(prisma, anthropic, config),
    usageUpsert,
    usageUpdateMany,
    checkCount,
    checkCreate,
    messagesCreate,
  };
}

const INPUT = { ideaText: 'アイデア本文', clientIp: '203.0.113.9' };

describe('PublicCheckService.run の費用の天井', () => {
  it('日次枠を AI 呼び出しより前に消費する', async () => {
    const { service, usageUpdateMany, messagesCreate } = makeService();
    await service.run(INPUT);

    expect(usageUpdateMany).toHaveBeenCalledTimes(1);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    // 後ろに回ると、AI が失敗し続ける限り無制限に叩けてしまう。
    expect(usageUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      messagesCreate.mock.invocationCallOrder[0]!,
    );
  });

  it('日次上限に到達していたら AI を呼ばずに 429 を返す', async () => {
    const { service, messagesCreate } = makeService({ quotaUpdated: 0 });
    await expect(service.run(INPUT)).rejects.toBeInstanceOf(PublicCheckDailyLimitError);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('当日行の用意は no-op upsert で行う(既存カウントを踏み潰さない)', async () => {
    // `update` に値を入れると、当日行が既にある場合にカウントを上書きしてしまう。
    const { service, usageUpsert } = makeService();
    await service.run(INPUT);
    expect(usageUpsert.mock.calls[0]?.[0]).toMatchObject({
      create: { count: 0 },
      update: {},
    });
  });

  it('上限判定は「count < 上限」の条件付き UPDATE で行う(読んでから比較しない)', async () => {
    // 先に読んでから比較する実装だと、並行リクエストが同じ値を読んで全員通ってしまう。
    const { service, usageUpdateMany } = makeService();
    await service.run(INPUT);
    expect(usageUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { count: { lt: PUBLIC_CHECK_DAILY_LIMIT } },
      data: { count: { increment: 1 } },
    });
  });

  it('AI が失敗しても日次枠を戻さない(コストは発生済み)', async () => {
    const messagesCreate = vi.fn().mockRejectedValue(new Error('anthropic down'));
    const { service, usageUpdateMany } = makeService({ create: messagesCreate });

    await expect(service.run(INPUT)).rejects.toBeTruthy();
    expect(usageUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('max_tokens を明示して出力側の上限を固定する', async () => {
    const { service, messagesCreate } = makeService();
    await service.run(INPUT);
    expect(messagesCreate.mock.calls[0]?.[0]).toMatchObject({
      max_tokens: PUBLIC_CHECK_MAX_TOKENS,
    });
  });

  it('Web Search Tool を使わない(公開版のコスト削減の本体)', async () => {
    const { service, messagesCreate } = makeService();
    await service.run(INPUT);
    const tools = messagesCreate.mock.calls[0]?.[0]?.tools as { name: string }[];
    expect(tools.map((t) => t.name)).toEqual(['submit_idea_validation']);
  });
});

describe('PublicCheckService.run の IP レート制限(補助層)', () => {
  it('日次枠を消費する前に弾く(単一の発信元が枠を空にできないように)', async () => {
    const { service, usageUpdateMany, messagesCreate } = makeService({
      recentByIp: PUBLIC_CHECK_IP_RATE_LIMIT,
    });

    await expect(service.run(INPUT)).rejects.toBeInstanceOf(PublicCheckIpRateLimitError);
    expect(usageUpdateMany).not.toHaveBeenCalled();
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('上限の 1 つ手前までは通す', async () => {
    const { service, messagesCreate } = makeService({
      recentByIp: PUBLIC_CHECK_IP_RATE_LIMIT - 1,
    });
    await service.run(INPUT);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it('IP が取れなければ素通しする(日次上限に委ねる)', async () => {
    const { service, checkCount, messagesCreate } = makeService();
    await service.run({ ideaText: 'アイデア本文', clientIp: null });
    expect(checkCount).not.toHaveBeenCalled();
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it('ソルト未設定なら素通しする(fail open。主防御は日次上限)', async () => {
    const { service, checkCount, messagesCreate, checkCreate } = makeService({ salt: undefined });
    await service.run(INPUT);
    expect(checkCount).not.toHaveBeenCalled();
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    expect(checkCreate.mock.calls[0]?.[0]?.data?.ipHash).toBeNull();
  });
});

describe('PublicCheckService.run の永続化', () => {
  it('生 IP ではなくハッシュを保存する', async () => {
    const { service, checkCreate } = makeService();
    await service.run(INPUT);
    const data = checkCreate.mock.calls[0]?.[0]?.data;
    expect(data.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.ipHash).not.toContain('203.0.113.9');
  });

  it('スコアを内部値 0〜60 のまま保存する(表示層で正規化するため)', async () => {
    const { service, checkCreate } = makeService();
    await service.run(INPUT);
    expect(checkCreate.mock.calls[0]?.[0]?.data?.totalScore).toBe(36);
  });

  it('実費とトークン数を記録する(ADR-015 の監視すべき指標)', async () => {
    const { service, checkCreate } = makeService();
    await service.run(INPUT);
    const data = checkCreate.mock.calls[0]?.[0]?.data;
    expect(data.tokensIn).toBe(3200);
    expect(data.tokensOut).toBe(1700);
    expect(Number(data.costJpy)).toBeGreaterThan(0);
  });

  it('推測不能な ID を採番する(cuid の単調増加成分を避ける)', async () => {
    const { service, checkCreate } = makeService();
    await service.run(INPUT);
    await service.run(INPUT);
    const first = checkCreate.mock.calls[0]?.[0]?.data?.id as string;
    const second = checkCreate.mock.calls[1]?.[0]?.data?.id as string;
    expect(first).toHaveLength(22);
    expect(first).not.toBe(second);
  });
});
