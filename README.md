# Shipyard

個人開発者および小規模開発チーム(2〜10 人)向けの、「アイデア → 設計 → 開発 → リリース → 初期ユーザー獲得」までを一元管理する AI 支援付き B2B SaaS です。

> **現在のステータス**: Week 1 / Day 6 完了。`apps/web`(Next.js 15 + Tailwind v4 + shadcn/ui + Clerk)+ `apps/api`(NestJS 11)+ `packages/db`(Prisma 6 / PostgreSQL 16 + pgvector)が稼働。マルチテナント基盤(Prisma Client Extension で `tenantId` 自動注入、`TenantMiddleware`、Clerk JWT Guard)+ Stripe 課金基盤(`POST /webhooks/stripe` の署名検証 + Idempotency、`BillingService` で Subscription / `Tenant.plan` 同期、`POST /workspaces/:slug/checkout-session`)実装済み・stripe-cli で E2E 確認済み。残りは Day 7(AI)。

## 主要機能

- **マルチプロジェクト管理**: 複数の個人開発プロジェクトを並列で管理
- **AI 支援**: 競合調査・README / LP / 告知文の自動ドラフト・タスク分解・チェックリスト生成(Anthropic Claude)
- **過去資産の RAG**: 過去のプロジェクトドキュメントをベクトル検索して、新規生成時にコンテキストとして注入(独自性)
- **リリース前チェックリスト**: 技術 / 法務 / マーケ / UX / その他の 5 カテゴリで自動生成
- **チーム機能**(Team プラン): メンバー招待・6 種ロール(OWNER / ADMIN / DEVELOPER / REVIEWER / TESTER / VIEWER)・共同編集・レビュー・監査ログ

## 技術スタック

| 領域                | 採用                                                         |
| ------------------- | ------------------------------------------------------------ |
| フロントエンド      | Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui |
| バックエンド        | NestJS + Prisma                                              |
| データベース        | PostgreSQL 16 + pgvector                                     |
| 認証                | Clerk                                                        |
| 決済                | Stripe Subscriptions                                         |
| AI                  | Anthropic API(Claude Sonnet 4 + Haiku 4.5)                   |
| キュー / キャッシュ | Redis(ElastiCache)+ BullMQ                                   |
| ストレージ          | AWS S3                                                       |
| インフラ            | Vercel(Web)+ AWS ECS Fargate(API)+ RDS Aurora Serverless v2  |
| Monorepo            | Turborepo + pnpm                                             |

詳細は [docs/adr/001-tech-stack.md](./docs/adr/001-tech-stack.md) を参照してください。

## 必要な環境

- **Node.js**: 22 系(推奨: [mise](https://mise.jdx.dev) でバージョン管理、`.mise.toml` 参照)
- **pnpm**: 10 系(`packageManager` で固定済み、Corepack 経由で自動切替)
- **Docker Desktop**: PostgreSQL を起動するため

## セットアップ

### Day 6 完了時点で動作する手順

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
docker compose ps   # postgres が "healthy" であることを確認

# 5. 環境変数を設定(Clerk / DB / Stripe)
cp apps/web/.env.example  apps/web/.env.local   # Clerk publishable/secret key, API_URL
cp apps/api/.env.example  apps/api/.env.local   # DATABASE_URL, CLERK_SECRET_KEY, PORT, STRIPE_*, APP_BASE_URL
cp packages/db/.env.example packages/db/.env    # DATABASE_URL(Prisma CLI 用)
# 各 .env.local / .env を編集:
#  - Clerk の API キー(https://clerk.com で Application を作成)
#  - Stripe のシークレットキーと Price ID(https://dashboard.stripe.com、テストモード)。
#    課金フローを動かさないなら .env.example のプレースホルダのままでも起動はする
#  - STRIPE_WEBHOOK_SECRET は `stripe listen`(下記)の出力 whsec_... を貼る

# 6. DB マイグレーション適用 + Prisma Client 生成
pnpm --filter @shipyard/db migrate:dev   # 初回は migrations/ を適用
pnpm --filter @shipyard/db generate      # Prisma Client + ER 図(docs/data-model-erd.generated.md)

# 7. packages/db をビルド(apps/api が import するため)
pnpm --filter @shipyard/db build

# 8. lint / format / type-check
pnpm lint
pnpm format:check

# 9. 開発サーバー起動
pnpm --filter @shipyard/api dev   # → http://localhost:4000(NestJS)
pnpm --filter @shipyard/web dev   # → http://localhost:3000(Next.js)
# または両方まとめて
pnpm dev                          # Turborepo 経由で web + api 同時起動
```

> シード(開発用ダミーデータ投入)は Week 2 以降で `pnpm db:seed` を整備予定。

最終的には `pnpm install` から `pnpm dev` まで 5 分以内で `http://localhost:3000` にアクセス可能な状態を目指します。

### Stripe Webhook のローカルテスト(任意)

課金フロー(`POST /webhooks/stripe` / Checkout)を試す場合は [Stripe CLI](https://docs.stripe.com/stripe-cli) を使います:

```bash
stripe login                                                    # ブラウザで Stripe アカウントに接続
stripe listen --forward-to localhost:4000/webhooks/stripe        # 出力の whsec_... を apps/api/.env.local の STRIPE_WEBHOOK_SECRET に貼る
# 別ターミナルで:
stripe trigger checkout.session.completed                        # イベントを発火 → API に転送される
```

Checkout の動作確認は `POST /workspaces/{slug}/checkout-session`(Clerk JWT 必須・OWNER のみ)で URL を取得し、テストカード `4242 4242 4242 4242` で支払う。

## 利用可能な scripts

ルート `package.json` 経由で実行可能なコマンド:

| コマンド                                 | 内容                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm install`                           | 全 workspace の依存をインストール                                                     |
| `pnpm lint`                              | ESLint(`eslint .`)を実行                                                              |
| `pnpm lint:fix`                          | ESLint の自動修正(`eslint . --fix`)                                                   |
| `pnpm format`                            | Prettier で自動整形(`prettier --write .`)                                             |
| `pnpm format:check`                      | Prettier の整形チェック(差分があれば exit 1)                                          |
| `pnpm build`                             | Turborepo 経由で全 workspace の build を実行(`apps/web` / `apps/api` / `packages/db`) |
| `pnpm dev`                               | Turborepo 経由で `apps/web`(3000)+ `apps/api`(4000)を同時起動                         |
| `pnpm test`                              | Turborepo 経由で全 workspace の test を実行(テスト雛形は Week 2 以降で導入)           |
| `pnpm --filter @shipyard/web dev`        | `apps/web` だけを起動(http://localhost:3000)                                          |
| `pnpm --filter @shipyard/api dev`        | `apps/api` だけを起動(http://localhost:4000、NestJS watch モード)                     |
| `pnpm --filter @shipyard/db migrate:dev` | Prisma マイグレーションを生成・適用(`packages/db/.env` の `DATABASE_URL`)             |
| `pnpm --filter @shipyard/db generate`    | Prisma Client + ER 図(`docs/data-model-erd.generated.md`)を生成                       |
| `pnpm --filter @shipyard/db studio`      | Prisma Studio を起動(http://localhost:5555 で DB を GUI 操作)                         |
| `pnpm --filter @shipyard/db build`       | `packages/db` を `dist/` にビルド(apps/api が import するため)                        |
| `pnpm --filter <pkg> type-check`         | 各 workspace の TypeScript 型チェック(`tsc --noEmit`)                                 |

## モノレポ構造

```
ship-yard/
├── apps/
│   ├── web/        @shipyard/web   - Next.js 15 + Tailwind v4 + shadcn/ui + Clerk(Day 4 完了)
│   └── api/        @shipyard/api   - NestJS 11 + Prisma 統合 + TenantMiddleware + Clerk JWT Guard + Stripe(Webhook 署名検証 / Idempotency / Subscription 同期 / Checkout)(Day 6 完了)
├── packages/
│   ├── db/         @shipyard/db    - Prisma 6 schema + Client + マイグレーション + tenant 分離 Extension(Day 5 完了)
│   ├── ui/         @shipyard/ui    - 共通 UI(packages/ui への切り出しは Week 2 以降)
│   └── types/      @shipyard/types - フロント↔バック共有型定義(Week 2 以降)
├── eslint-rules/                    - 独自 ESLint ルール(no-raw-sql-without-tenant-filter 等)
├── docs/                            - 設計・運用ドキュメント
├── .vscode/                         - 推奨 IDE 設定(Tailwind v4 at-rule の警告抑制等)
└── docker-compose.yml               - ローカル DB(PostgreSQL + pgvector)
```

詳細は [ADR-006: モノレポ構成](./docs/adr/006-monorepo-structure.md) 参照。

## ドキュメント

| ファイル                                                               | 内容                                                                                         |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [docs/OVERVIEW.md](./docs/OVERVIEW.md)                                 | プロダクト概要(まずこれを読めば全体像が掴める)                                               |
| [docs/PROJECT_STATUS.md](./docs/PROJECT_STATUS.md)                     | プロジェクト全体の状況・決定事項・ロードマップ(Single Source of Truth)                       |
| [docs/GOALS.md](./docs/GOALS.md)                                       | 目標体系                                                                                     |
| [docs/adr/](./docs/adr/)                                               | Architecture Decision Records(設計判断の言語化、6 本)                                        |
| [docs/data-model.md](./docs/data-model.md)                             | ER 図 + Prisma スキーマ + インデックス戦略(手動メンテの SSoT)                                |
| [docs/data-model-erd.generated.md](./docs/data-model-erd.generated.md) | `schema.prisma` から自動生成した Mermaid ER 図(`pnpm --filter @shipyard/db generate` で更新) |
| [docs/architecture.md](./docs/architecture.md)                         | C4 Context / Container + AWS デプロイ構成                                                    |
| [docs/screen-flow.md](./docs/screen-flow.md)                           | 6 つの主要ユーザーフロー(オンボーディング・招待・課金 等)                                    |
| [docs/setup-vercel.md](./docs/setup-vercel.md)                         | Vercel セットアップ手順(Day 4 で実行済み)                                                    |

## CI

GitHub Actions で `main` への push と PR ごとに自動実行:

- ESLint チェック
- Prettier フォーマットチェック

詳細は [.github/workflows/ci.yml](./.github/workflows/ci.yml) 参照。

## ライセンス

[MIT License](./LICENSE)
