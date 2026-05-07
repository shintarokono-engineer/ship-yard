# Shipyard

個人開発者および小規模開発チーム(2〜10 人)向けの、「アイデア → 設計 → 開発 → リリース → 初期ユーザー獲得」までを一元管理する AI 支援付き B2B SaaS です。

> **現在のステータス**: Week 1 / Day 3 完了(開発環境構築済み)。`apps/web`(Next.js)・`apps/api`(NestJS)の実コードは Day 4 以降に導入予定。

## 主要機能

- **マルチプロジェクト管理**: 複数の個人開発プロジェクトを並列で管理
- **AI 支援**: 競合調査・README / LP / 告知文の自動ドラフト・タスク分解・チェックリスト生成(Anthropic Claude)
- **過去資産の RAG**: 過去のプロジェクトドキュメントをベクトル検索して、新規生成時にコンテキストとして注入(独自性)
- **リリース前チェックリスト**: 技術 / 法務 / マーケ / UX / その他の 5 カテゴリで自動生成
- **チーム機能**(Team プラン): メンバー招待・6 種ロール(OWNER / ADMIN / DEVELOPER / REVIEWER / TESTER / VIEWER)・共同編集・レビュー・監査ログ

## 技術スタック

| 領域                | 採用                                                              |
| ------------------- | ----------------------------------------------------------------- |
| フロントエンド      | Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui      |
| バックエンド        | NestJS + Prisma                                                   |
| データベース        | PostgreSQL 16 + pgvector                                          |
| 認証                | Clerk                                                             |
| 決済                | Stripe Subscriptions                                              |
| AI                  | Anthropic API(Claude Sonnet 4 + Haiku 4.5)                        |
| キュー / キャッシュ | Redis(ElastiCache)+ BullMQ                                        |
| ストレージ          | AWS S3                                                            |
| インフラ            | Vercel(Web)+ AWS ECS Fargate(API)+ RDS Aurora Serverless v2     |
| Monorepo            | Turborepo + pnpm                                                  |

詳細は [docs/adr/001-tech-stack.md](./docs/adr/001-tech-stack.md) を参照してください。

## 必要な環境

- **Node.js**: 22 系(推奨: [mise](https://mise.jdx.dev) でバージョン管理、`.mise.toml` 参照)
- **pnpm**: 10 系(`packageManager` で固定済み、Corepack 経由で自動切替)
- **Docker Desktop**: PostgreSQL を起動するため

## セットアップ

### Day 3 完了時点で動作する手順

```bash
# 1. リポジトリをクローン
git clone git@github.com:shintarokono-engineer/ship-yard.git
cd ship-yard

# 2. ツールバージョンを揃える(mise を使う場合)
mise install   # Node 22 + pnpm 10 を自動取得

# 3. 依存関係をインストール
pnpm install

# 4. ローカル DB の起動(PostgreSQL 16 + pgvector)
docker compose up -d

# 5. ヘルスチェック
docker compose ps   # postgres が "healthy" 状態であることを確認

# 6. lint と format チェック
pnpm lint
pnpm format:check
```

### Day 4 以降に動作するようになる手順

> 以下は Next.js / NestJS / Prisma 雛形が導入された後で動作します。

```bash
# 環境変数設定(.env.example は Day 4 で作成予定)
cp .env.example .env.local
# .env.local を編集し、Clerk / Stripe / Anthropic の各 API キーを設定

# DB マイグレーション + Seed(Day 5 以降)
pnpm db:migrate
pnpm db:seed

# 開発サーバー起動(Day 4 以降)
pnpm dev
```

最終的には `pnpm install` から `pnpm dev` まで 5 分以内で `http://localhost:3000` にアクセス可能な状態を目指します。

## 利用可能な scripts

ルート `package.json` 経由で実行可能なコマンド:

| コマンド             | 内容                                                          |
| -------------------- | ------------------------------------------------------------- |
| `pnpm install`       | 全 workspace の依存をインストール                            |
| `pnpm lint`          | ESLint(`eslint .`)を実行                                     |
| `pnpm lint:fix`      | ESLint の自動修正(`eslint . --fix`)                         |
| `pnpm format`        | Prettier で自動整形(`prettier --write .`)                  |
| `pnpm format:check`  | Prettier の整形チェック(差分があれば exit 1)               |
| `pnpm build`         | Turborepo 経由で全 workspace の build を実行(Day 4 以降)  |
| `pnpm dev`           | Turborepo 経由で全 workspace の dev を起動(Day 4 以降)    |
| `pnpm test`          | Turborepo 経由で全 workspace の test を実行(Day 4 以降)   |

## モノレポ構造

```
ship-yard/
├── apps/
│   ├── web/        @shipyard/web   - Next.js フロントエンド(Day 4 で実装)
│   └── api/        @shipyard/api   - NestJS バックエンド(Day 4 で実装)
├── packages/
│   ├── db/         @shipyard/db    - Prisma スキーマ + Client(Day 5 で実装)
│   ├── ui/         @shipyard/ui    - 共通 UI(shadcn/ui ベース、Day 4-5 で実装)
│   └── types/      @shipyard/types - フロント↔バック共有型定義
├── docs/                            - 設計・運用ドキュメント
└── docker-compose.yml               - ローカル DB(PostgreSQL + pgvector)
```

詳細は [ADR-006: モノレポ構成](./docs/adr/006-monorepo-structure.md) 参照。

## ドキュメント

| ファイル                                           | 内容                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| [docs/OVERVIEW.md](./docs/OVERVIEW.md)             | プロダクト概要(まずこれを読めば全体像が掴める)                       |
| [docs/PROJECT_STATUS.md](./docs/PROJECT_STATUS.md) | プロジェクト全体の状況・決定事項・ロードマップ(Single Source of Truth) |
| [docs/GOALS.md](./docs/GOALS.md)                   | 目標体系                                                               |
| [docs/adr/](./docs/adr/)                           | Architecture Decision Records(設計判断の言語化、6 本)                |
| [docs/data-model.md](./docs/data-model.md)         | ER 図 + Prisma スキーマ + インデックス戦略                             |
| [docs/architecture.md](./docs/architecture.md)     | C4 Context / Container + AWS デプロイ構成                              |
| [docs/screen-flow.md](./docs/screen-flow.md)       | 6 つの主要ユーザーフロー(オンボーディング・招待・課金 等)             |
| [docs/setup-vercel.md](./docs/setup-vercel.md)     | Vercel セットアップ手順(Day 4 で実行)                              |

## CI

GitHub Actions で `master` への push と PR ごとに自動実行:

- ESLint チェック
- Prettier フォーマットチェック

詳細は [.github/workflows/ci.yml](./.github/workflows/ci.yml) 参照。

## ライセンス

[MIT License](./LICENSE)
