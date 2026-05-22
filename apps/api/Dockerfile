# syntax=docker/dockerfile:1
#
# Shipyard API(NestJS)のコンテナイメージ。
# pnpm モノレポのため build context はリポジトリルートを取る:
#   docker build -f apps/api/Dockerfile -t shipyard/api .
#
# App Runner で動かす(ADR-011)。env / Secrets はイメージに焼かず、App Runner の
# runtime 設定で注入する。

# ============================================================================
# ビルドステージ
# ============================================================================
FROM node:22-slim AS build

# Prisma は openssl を要求する。
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# packageManager フィールド(pnpm@10.x)を corepack で有効化。
RUN corepack enable

WORKDIR /app

# 依存解決に必要なマニフェストを先にコピーし、レイヤキャッシュを効かせる。
# pnpm-lock.yaml は全ワークスペースを参照するため、各 package.json も必要。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/

# postinstall(prisma generate / tsc)は後段で明示実行するため --ignore-scripts。
RUN pnpm install --frozen-lockfile --ignore-scripts

# ソースをコピーしてビルドする。
COPY . .

# Prisma Client のみ生成する(erd ジェネレータは Docker では不要)。
RUN pnpm --filter @shipyard/db exec prisma generate --generator client

# 依存順にビルド: db(tsc)→ api(nest build)。
RUN pnpm --filter @shipyard/db build \
  && pnpm --filter @shipyard/api build

# ============================================================================
# ランタイムステージ
# ============================================================================
FROM node:22-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# ビルド成果物・生成済み Prisma Client を含む /app 一式をコピーする。
# pnpm のワークスペース symlink 構造を保つため一括コピー。本番依存への prune に
# よるイメージ縮小は v2 のフォローアップ。
COPY --from=build --chown=node:node /app ./

# 非 root ユーザーで実行する。
USER node

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
