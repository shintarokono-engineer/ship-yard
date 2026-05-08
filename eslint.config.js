import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import nextPlugin from '@next/eslint-plugin-next';

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
  eslintConfigPrettier,
);
