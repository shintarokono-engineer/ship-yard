/**
 * AI クレジット原子的予約(ADR-012)の並行性検証スクリプト。
 *
 * 目的:
 *   `AIUsageService.reserveCredits` の TOCTOU 対策(`pg_advisory_xact_lock` + 予約行 INSERT)が、
 *   同一テナントの同時リクエストに対して本当に「上限を超えない」ことを **実 DB** で確認する。
 *   ユニットテスト(`ai-usage.reservation.spec.ts`)は Prisma をモックするため advisory lock の
 *   直列化効果までは検証できない。本スクリプトは稼働中の Postgres に対して実際に並行実行する。
 *
 * シナリオ:
 *   PRO テナント(上限 300 cr)に「消費済み 288 cr」を仕込み、残枠を Sonnet(3 cr)ちょうど 4 回分にする。
 *   そこへ 12 本の予約を同時発火し、以下を assert する。
 *     - 成功はちょうど 4 本(= floor((300 - 288) / 3))
 *     - 残り 8 本は ForbiddenException(上限超過)
 *     - 最終的な当月消費合計はちょうど 300 cr(1 cr も超過しない)
 *   ロックが無ければ 12 本すべてが古い used=288 を読んで通過し 288 + 12×3 = 324 cr に膨らむ。
 *   324 ではなく 300 で止まることが、直列化が効いている証跡になる。
 *
 * 使い方:
 *   pnpm --filter @shipyard/api verify:credit-reservation
 *
 * 前提:
 *   - `apps/api/.env.local` の `DATABASE_URL` が指す Postgres が起動していること(docker compose up -d)
 *   - schema がマイグレーション済みであること
 *
 * 副作用:
 *   - `__verify_credit_reservation` 接頭辞のテスト用 User / Tenant / AIUsage を作成し、終了時に必ず削除する
 *   - 冪等:実行前にも同じ接頭辞の残骸を掃除してから始める
 */
import { PrismaClient, Feature, Plan } from '@shipyard/db';
import { ForbiddenException } from '@nestjs/common';

import { AIUsageService } from '../src/ai/ai-usage.service';
import { AI_MODEL_SONNET, PLAN_CREDIT_LIMITS, MODEL_CREDITS } from '../src/ai/ai.constants';

const TAG = '__verify_credit_reservation';
const USER_ID = `${TAG}_user`;
const TENANT_ID = `${TAG}_tenant`;
const CONCURRENCY = 12;

const PRO_LIMIT = PLAN_CREDIT_LIMITS[Plan.PRO] ?? 0; // 300
const SONNET_COST = MODEL_CREDITS[AI_MODEL_SONNET]; // 3
const SEED_USED = PRO_LIMIT - SONNET_COST * 4; // 288 → 残枠ちょうど 4 本
const EXPECTED_SUCCESS = 4;

async function cleanup(prisma: PrismaClient): Promise<void> {
  // AIUsage は Tenant への onDelete: Cascade だが、明示削除して順序依存を避ける。
  await prisma.aIUsage.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
}

async function main(): Promise<void> {
  // 素の PrismaClient を使う(reserveCredits は tenantId を明示注入するため ALS 自動注入は不要)。
  const prisma = new PrismaClient();
  const service = new AIUsageService(prisma as never);

  let ok = true;
  try {
    await prisma.$connect();
    await cleanup(prisma); // 前回の残骸を掃除(冪等性)

    // --- セットアップ ---
    await prisma.user.create({
      data: { id: USER_ID, clerkUserId: `${TAG}_clerk`, email: `${TAG}@example.test` },
    });
    await prisma.tenant.create({
      data: {
        id: TENANT_ID,
        slug: `${TAG}-ws`,
        name: 'Verify WS',
        plan: Plan.PRO,
        ownerId: USER_ID,
      },
    });
    // 消費済み 288 cr を 1 行で仕込む(feature は OTHER 以外なら何でもよい)。
    await prisma.aIUsage.create({
      data: {
        tenantId: TENANT_ID,
        userId: USER_ID,
        model: AI_MODEL_SONNET,
        feature: Feature.DRAFT_GEN,
        tokensIn: 0,
        tokensOut: 0,
        costJpy: '0',
        credits: SEED_USED,
      },
    });

    // --- 並行発火 ---
    const tenant = { id: TENANT_ID, plan: Plan.PRO };
    const usage = { userId: USER_ID, model: AI_MODEL_SONNET, feature: Feature.DRAFT_GEN };
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () => service.reserveCredits(tenant, usage)),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const forbidden = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof ForbiddenException,
    ).length;
    const otherErrors = results.filter(
      (r) => r.status === 'rejected' && !(r.reason instanceof ForbiddenException),
    );

    // --- 実 DB の最終状態を確認 ---
    const agg = await prisma.aIUsage.aggregate({
      where: { tenantId: TENANT_ID },
      _sum: { credits: true },
    });
    const finalUsed = agg._sum.credits ?? 0;

    // --- 検証 ---
    const checks: { name: string; pass: boolean; detail: string }[] = [
      {
        name: `成功はちょうど ${EXPECTED_SUCCESS} 本`,
        pass: succeeded === EXPECTED_SUCCESS,
        detail: `actual=${succeeded}`,
      },
      {
        name: `残りは 403(ForbiddenException)= ${CONCURRENCY - EXPECTED_SUCCESS} 本`,
        pass: forbidden === CONCURRENCY - EXPECTED_SUCCESS,
        detail: `actual=${forbidden}`,
      },
      {
        name: '予期しない例外が 0 本',
        pass: otherErrors.length === 0,
        detail:
          otherErrors.map((e) => String((e as PromiseRejectedResult).reason)).join(' | ') || 'none',
      },
      {
        name: `最終消費はちょうど上限 ${PRO_LIMIT} cr(超過なし)`,
        pass: finalUsed === PRO_LIMIT,
        detail: `actual=${finalUsed}(ロック無しなら ${SEED_USED + CONCURRENCY * SONNET_COST} に膨張)`,
      },
    ];

    console.log(
      `\n並行予約検証(concurrency=${CONCURRENCY}, seed=${SEED_USED}cr, cost=${SONNET_COST}cr/本)`,
    );
    for (const c of checks) {
      console.log(`  ${c.pass ? '✅' : '❌'} ${c.name} … ${c.detail}`);
      if (!c.pass) ok = false;
    }
  } catch (err) {
    ok = false;
    console.error('検証中にエラー:', err);
  } finally {
    await cleanup(prisma);
    await prisma.$disconnect();
  }

  console.log(`\n結果: ${ok ? 'PASS(TOCTOU 対策は有効)' : 'FAIL'}\n`);
  process.exit(ok ? 0 : 1);
}

void main();
