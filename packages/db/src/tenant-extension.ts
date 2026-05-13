import { Prisma } from '@prisma/client';

import { getTenantId } from './tenant-context';

/**
 * マルチテナント分離のための Prisma Client Extension(ADR-002 / docs/data-model.md)。
 *
 * 業務テーブル(tenantId カラムを持つもの)への query に対し、
 * AsyncLocalStorage(TenantContext)に入っている tenantId を自動注入する:
 *  - 読み取り(find* / count / aggregate / groupBy): where に tenantId を追加
 *  - 作成(create / createMany): data に tenantId を追加
 *  - 更新・削除(update* / delete* / upsert): where に tenantId を追加(+ upsert は create にも)
 *
 * 対象モデル: Project / ChecklistItem / ProjectDocument / AIUsage / InvitationToken
 * 対象外: User / WebhookEvent(テナントを持たない)
 * 別扱い: TenantMember / Subscription(複合 PK / 1:1。Service 層で明示的に tenantId を渡す)
 *
 * tenantId が ALS に無い場合(テナント未確定のリクエスト・マイグレーションスクリプト等)は
 * 注入せずそのまま流す(呼び出し側の責任)。Prisma 6 の extendedWhereUnique が GA なので
 * findUnique / update / delete の where にも非ユニークフィールド(tenantId)を足せる。
 */

const TENANT_SCOPED_MODELS = new Set<string>([
  'Project',
  'ChecklistItem',
  'ProjectDocument',
  'AIUsage',
  'InvitationToken',
]);

type AnyArgs = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
};

/**
 * `obj` に ALS コンテキストの `tenantId` を注入する。
 * 既に別の `tenantId` が入っている場合は「リクエストコンテキストのテナント」と
 * 「クエリ/データが明示したテナント」が食い違っている(= バグ or テナント越境の試み)とみなして throw する。
 * 同じ値が明示されている分には許容(path slug ベースのルートが明示注入するパターンと共存させるため)。
 */
function mergeTenantId(
  obj: Record<string, unknown> | undefined,
  tenantId: string,
): Record<string, unknown> {
  const existing = obj?.tenantId;
  if (typeof existing === 'string' && existing !== tenantId) {
    throw new Error(
      `tenant mismatch: ${existing} (specified in query/data) vs ${tenantId} (request tenant context)`,
    );
  }
  return { ...(obj ?? {}), tenantId };
}

function withTenantWhere(args: AnyArgs | undefined, tenantId: string): AnyArgs {
  return { ...args, where: mergeTenantId(args?.where, tenantId) };
}

function withTenantData(data: AnyArgs['data'], tenantId: string): AnyArgs['data'] {
  if (Array.isArray(data)) {
    return data.map((item) => mergeTenantId(item, tenantId));
  }
  return mergeTenantId(data, tenantId);
}

function injectTenantId(operation: string, args: AnyArgs | undefined, tenantId: string): AnyArgs {
  switch (operation) {
    // 読み取り系 + updateMany/deleteMany: where に tenantId を追加
    case 'findUnique':
    case 'findUniqueOrThrow':
    case 'findFirst':
    case 'findFirstOrThrow':
    case 'findMany':
    case 'count':
    case 'aggregate':
    case 'groupBy':
    case 'update':
    case 'updateMany':
    case 'delete':
    case 'deleteMany':
      return withTenantWhere(args, tenantId);

    // 作成系: data に tenantId を追加
    case 'create':
      return { ...args, data: withTenantData(args?.data, tenantId) };
    case 'createMany':
    case 'createManyAndReturn':
      return { ...args, data: withTenantData(args?.data, tenantId) };

    // upsert: where と create の両方に tenantId を追加(update 側は不変)
    case 'upsert':
      return {
        ...args,
        where: mergeTenantId(args?.where, tenantId),
        create: mergeTenantId(args?.create, tenantId),
      };

    default:
      return args ?? {};
  }
}

export const tenantExtension = Prisma.defineExtension({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (!model || !TENANT_SCOPED_MODELS.has(model)) {
          return query(args);
        }
        const tenantId = getTenantId();
        if (!tenantId) {
          return query(args);
        }
        return query(injectTenantId(operation, args as AnyArgs, tenantId));
      },
    },
  },
});
