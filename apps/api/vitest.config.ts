import { defineConfig } from 'vitest/config';

/**
 * Vitest 設定(ADR-014 Day 56 で導入)。
 *
 * NestJS は CommonJS + decorator(`tsconfig.json` の `module: commonjs`)で動かしているが、
 * Vitest は内部で esbuild がトランスパイルするため別途設定は不要。`globals: true` で
 * `describe / it / expect` をグローバルに公開し、Jest 互換 API でテストを書ける。
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['dist/**', 'scripts/**', '**/*.spec.ts', '**/*.module.ts'],
    },
  },
});
