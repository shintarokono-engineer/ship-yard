import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import nextPlugin from '@next/eslint-plugin-next';

import noRawSqlWithoutTenantFilter from './eslint-rules/no-raw-sql-without-tenant-filter.js';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/build/**',
      '**/coverage/**',
      '**/next-env.d.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    // Next.js 専用ルールは apps/web 配下のみに適用
    files: ['apps/web/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // App Router 専用なので Pages Router 用のルールは無効化
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    // Shipyard 独自ルール。raw SQL を扱いうる API / packages のみに適用(ADR-002)
    files: ['apps/api/**/*.ts', 'packages/**/*.ts'],
    plugins: {
      shipyard: {
        rules: {
          'no-raw-sql-without-tenant-filter': noRawSqlWithoutTenantFilter,
        },
      },
    },
    rules: {
      'shipyard/no-raw-sql-without-tenant-filter': 'error',
    },
  },
  eslintConfigPrettier,
);
