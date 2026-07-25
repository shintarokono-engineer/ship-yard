/**
 * cursor ページング(common/pagination.ts)の継続正しさを実 DB で検証するスクリプト。
 *
 * 目的:
 *   `RagQaService.listSessions`(cursor ページングを使う実サービス)で、複数ページに跨いで
 *   **重複も欠落もなく全件を走査できる**ことを実 Postgres で確認する。告知一覧
 *   (`AnnouncementService.list`)も同じ共通ヘルパ(`cursorArgs`/`toCursorPage`)を使うため、
 *   この 1 本で共通ロジックの継続正しさを担保する。
 *
 * シナリオ:
 *   51 件のセッションを作り、`updatedAt` を **全件同一時刻**に強制する(並び順の第 1 キーが
 *   全部タイになり、第 2 キー = id のタイブレークだけで順序が決まる = 最も壊れやすい状況)。
 *   limit=20 で先頭から `nextCursor` を辿って全ページ取得し、以下を assert する。
 *     - 総取得 51 件、ユニーク 51 件(重複なし)
 *     - 取得 id 集合 = 投入 id 集合(欠落なし)
 *     - ページ構成 = [20, 20, 11]、最終ページの nextCursor = null
 *
 * 使い方:
 *   pnpm --filter @shipyard/api verify:cursor-pagination
 *
 * 副作用:
 *   - `__verify_cursor_pagination` 接頭辞のテスト用 User / Tenant / Project / RagQaSession を作成し、終了時に必ず削除する
 *   - 冪等:実行前にも同じ接頭辞の残骸を掃除してから始める
 */
import { PrismaClient, Plan } from '@shipyard/db';

import { RagQaService } from '../src/ai/rag-qa.service';

const TAG = '__verify_cursor_pagination';
const USER_ID = `${TAG}_user`;
const TENANT_ID = `${TAG}_tenant`;
const PROJECT_ID = `${TAG}_project`;
const TOTAL = 51;
const LIMIT = 20;

async function cleanup(prisma: PrismaClient): Promise<void> {
  await prisma.ragQaSession.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.project.deleteMany({ where: { id: PROJECT_ID } });
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  // listSessions は this.prisma しか使わないため anthropic は不要(null で構築)。
  const service = new RagQaService(prisma as never, null as never);

  let ok = true;
  try {
    await prisma.$connect();
    await cleanup(prisma);

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
    await prisma.project.create({
      data: { id: PROJECT_ID, tenantId: TENANT_ID, name: 'Verify Project', createdById: USER_ID },
    });

    const seededIds: string[] = [];
    for (let i = 0; i < TOTAL; i++) {
      const row = await prisma.ragQaSession.create({
        data: {
          tenantId: TENANT_ID,
          projectId: PROJECT_ID,
          createdById: USER_ID,
          title: `session-${i}`,
        },
        select: { id: true },
      });
      seededIds.push(row.id);
    }

    // updatedAt を全件同一に固定(@updatedAt を回避するため raw UPDATE、WHERE "tenantId" でテナント限定)。
    // これで orderBy 第 1 キー(updatedAt)が全タイになり、id タイブレークだけが順序を決める。
    await prisma.$executeRaw`UPDATE "RagQaSession" SET "updatedAt" = TIMESTAMP '2026-01-01 00:00:00+00' WHERE "tenantId" = ${TENANT_ID}`;

    // --- cursor で全ページ走査 ---
    const pageSizes: number[] = [];
    const collected: string[] = [];
    let cursor: string | undefined;
    let lastNextCursor: string | null = null;
    for (let guard = 0; guard < 100; guard++) {
      const page = await service.listSessions(TENANT_ID, PROJECT_ID, { cursor, limit: LIMIT });
      pageSizes.push(page.items.length);
      collected.push(...page.items.map((s) => s.id));
      lastNextCursor = page.nextCursor;
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }

    const uniqueCount = new Set(collected).size;
    const seededSet = new Set(seededIds);
    const missing = seededIds.filter((id) => !collected.includes(id)).length;
    const extra = collected.filter((id) => !seededSet.has(id)).length;
    const expectedPageSizes = [LIMIT, LIMIT, TOTAL - LIMIT * 2]; // [20, 20, 11]

    const checks: { name: string; pass: boolean; detail: string }[] = [
      {
        name: `総取得 ${TOTAL} 件`,
        pass: collected.length === TOTAL,
        detail: `actual=${collected.length}`,
      },
      {
        name: `重複なし(ユニーク ${TOTAL})`,
        pass: uniqueCount === TOTAL,
        detail: `unique=${uniqueCount}`,
      },
      { name: '欠落なし(投入集合を完全被覆)', pass: missing === 0, detail: `missing=${missing}` },
      { name: '想定外 id の混入なし', pass: extra === 0, detail: `extra=${extra}` },
      {
        name: `ページ構成 [${expectedPageSizes.join(', ')}]`,
        pass: JSON.stringify(pageSizes) === JSON.stringify(expectedPageSizes),
        detail: `actual=[${pageSizes.join(', ')}]`,
      },
      {
        name: '最終ページの nextCursor=null',
        pass: lastNextCursor === null,
        detail: `last=${lastNextCursor}`,
      },
    ];

    console.log(
      `\ncursor 継続検証(total=${TOTAL}, limit=${LIMIT}, updatedAt 全件同一で id タイブレーク検証)`,
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

  console.log(`\n結果: ${ok ? 'PASS(cursor 継続は重複・欠落なし)' : 'FAIL'}\n`);
  process.exit(ok ? 0 : 1);
}

void main();
