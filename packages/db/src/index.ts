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

// 名前空間として型(`Prisma.ProjectSelect` 等)とランタイム値(`Prisma.PrismaClientKnownRequestError` 等)の両方を再エクスポート。
export { Prisma, PrismaClient } from '@prisma/client';

// schema.prisma の enum 群(値 + 型)。アプリ側はマジック文字列ではなくこれを使う。
export {
  Plan,
  Role,
  ProjectStatus,
  ItemStatus,
  Category,
  DocType,
  Feature,
  RagQaRole,
  SubStatus,
  WebhookStatus,
} from '@prisma/client';

// model 由来の型(値ではない)。Service / Controller の戻り値型として使う。
export type {
  RagQaSession,
  RagQaMessage,
  LandingPage,
  ServiceScore,
  IdeaValidation,
} from '@prisma/client';

// マルチテナントのリクエストコンテキスト(ADR-002)
export { runWithTenant, getTenantId, getTenantIdOrThrow } from './tenant-context';

// マルチテナント分離のための Prisma Client Extension(ADR-002)
export { tenantExtension } from './tenant-extension';

// Prisma エラーコードの定数 + 判定ヘルパー(マジック文字列 'P2025' 等を避ける)
export { PrismaErrorCode, isPrismaError } from './prisma-errors';
export type { PrismaErrorCodeValue } from './prisma-errors';
