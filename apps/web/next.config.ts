import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // モノレポ root を明示(ユーザーホームの別 lockfile が拾われるのを防ぐ)
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),

  // ESLint は monorepo root の `pnpm lint` で実行するため、build 中はスキップ
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
