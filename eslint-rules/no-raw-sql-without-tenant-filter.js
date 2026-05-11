/**
 * ESLint カスタムルール: no-raw-sql-without-tenant-filter
 *
 * Prisma の raw SQL メソッド($queryRaw / $queryRawUnsafe / $executeRaw / $executeRawUnsafe)
 * 呼び出しのうち、SQL 文に `tenantId`(または `tenant_id`)が含まれないものを検出する(ADR-002)。
 *
 * raw SQL は Prisma Client Extension のテナント自動注入が効かないため、手動で
 * `WHERE "tenantId" = ...` を書く必要がある。意図的にテナント非依存な query
 * (User / WebhookEvent への操作、CREATE EXTENSION 等)の場合は、その行に
 * `// eslint-disable-next-line shipyard/no-raw-sql-without-tenant-filter -- 理由` を付ける。
 */

const RAW_SQL_METHODS = new Set([
  '$queryRaw',
  '$queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
]);

/** tenantId / tenant_id を含むか(大小文字無視) */
function hasTenantFilter(text) {
  return /tenant_?id/i.test(text);
}

/** MemberExpression / TaggedTemplateExpression の callee/tag から raw SQL メソッド名を取り出す */
function getRawSqlMethodName(calleeOrTag) {
  if (
    calleeOrTag &&
    calleeOrTag.type === 'MemberExpression' &&
    calleeOrTag.property &&
    calleeOrTag.property.type === 'Identifier' &&
    RAW_SQL_METHODS.has(calleeOrTag.property.name)
  ) {
    return calleeOrTag.property.name;
  }
  return undefined;
}

/** テンプレートリテラルの静的部分を連結する($queryRaw`...` の中身) */
function getTemplateText(quasi) {
  return quasi.quasis.map((q) => q.value.raw).join(' ');
}

/** 文字列リテラル引数があればその値、無ければ undefined($queryRawUnsafe('...') の第1引数) */
function getFirstStringArg(args) {
  const first = args && args[0];
  if (first && first.type === 'Literal' && typeof first.value === 'string') {
    return first.value;
  }
  // テンプレートリテラル引数($queryRawUnsafe(`...`))
  if (first && first.type === 'TemplateLiteral') {
    return getTemplateText(first);
  }
  return undefined;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prisma の raw SQL は tenantId フィルタを含めること(ADR-002 マルチテナント分離)',
    },
    messages: {
      missingTenantFilter:
        'raw SQL ({{method}}) は tenantId フィルタを含めてください(ADR-002)。テナント非依存の query なら // eslint-disable-next-line shipyard/no-raw-sql-without-tenant-filter -- 理由 を付けてください。',
      unverifiable:
        'raw SQL ({{method}}) の SQL 文が静的に解析できません。tenantId フィルタの有無を目視確認し、問題なければ // eslint-disable-next-line shipyard/no-raw-sql-without-tenant-filter -- 理由 を付けてください。',
    },
    schema: [],
  },

  create(context) {
    return {
      // prisma.$queryRaw`SELECT ... WHERE "tenantId" = ${id}` 形式
      TaggedTemplateExpression(node) {
        const method = getRawSqlMethodName(node.tag);
        if (!method) return;
        const text = getTemplateText(node.quasi);
        if (hasTenantFilter(text)) return;
        context.report({ node, messageId: 'missingTenantFilter', data: { method } });
      },

      // prisma.$queryRawUnsafe('SELECT ...', id) 形式
      CallExpression(node) {
        const method = getRawSqlMethodName(node.callee);
        if (!method) return;
        const text = getFirstStringArg(node.arguments);
        if (text === undefined) {
          // 変数や式で SQL を組み立てている → 静的解析不能。警告して目視確認を促す
          context.report({ node, messageId: 'unverifiable', data: { method } });
          return;
        }
        if (hasTenantFilter(text)) return;
        context.report({ node, messageId: 'missingTenantFilter', data: { method } });
      },
    };
  },
};
