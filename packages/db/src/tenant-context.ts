import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * リクエストスコープで「現在のテナント」を保持する仕組み(ADR-002)。
 *
 * NestJS の Interceptor がリクエスト処理を `runWithTenant(tenantId, ...)` で包むことで、
 * 同じ async コンテキスト内のどこからでも `getTenantId()` で tenantId を取得できる。
 * Prisma Client Extension はこれを読んで業務テーブルの query に tenantId を自動注入する。
 */

interface TenantStore {
  /** 現在のリクエストが属するテナントの内部 ID(cuid) */
  tenantId: string;
}

const tenantStorage = new AsyncLocalStorage<TenantStore>();

/** 指定 tenantId のコンテキストで fn を実行する。NestJS Interceptor が使う。 */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn);
}

/** 現在のテナント ID を返す。コンテキスト外(テナント未確定のリクエスト)では undefined。 */
export function getTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}

/**
 * 現在のテナント ID を返す。コンテキスト外なら例外を投げる。
 * 「必ずテナントが確定しているはず」の場所(業務 Service 層)で使う。
 */
export function getTenantIdOrThrow(): string {
  const tenantId = getTenantId();
  if (!tenantId) {
    throw new Error(
      'Tenant context is not set. Ensure the request is wrapped by runWithTenant() (TenantInterceptor).',
    );
  }
  return tenantId;
}
