import { PrismaClient } from '@prisma/client';

// PrismaClient は接続プールを内部に持つため、アプリ全体で 1 インスタンスを共有する。
// dev 中の Hot Reload で複数インスタンスが生成される事故を防ぐため、globalThis にキャッシュ。
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { Prisma } from '@prisma/client';
export { PrismaClient } from '@prisma/client';

// マルチテナントのリクエストコンテキスト(ADR-002)
export { runWithTenant, getTenantId, getTenantIdOrThrow } from './tenant-context';
