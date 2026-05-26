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
    // 未使用変数 / 引数 / catch 引数で `_` プレフィックスを意図的な「未使用」 表現として許可。
    // TS/ESLint コミュニティ標準慣習。抽象メソッド・未実装メソッド・コールバックの未使用引数で
    // シグネチャを維持しつつ未使用エラーを回避するために使う(例: ADR-013 の骨組み実装)。
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
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
