# Shipyard

![Status](https://img.shields.io/badge/status-Week%206%20%2F%20Day%2040%20done-blue)
![Node](https://img.shields.io/badge/node-22-339933)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748)

個人開発者および小規模開発チーム(2〜10 人)向けの、「アイデア → 設計 → 開発 → リリース → 初期ユーザー獲得」までを一元管理する AI 支援付き B2B SaaS です。

> **現在のステータス**: Week 6 進行中(Day 40 完了 / 公開目標 Day 44)。マルチテナント基盤・課金基盤・AI 基盤・RAG・LP ブロック化と公開 URL・AWS インフラ(Terraform、ADR-011 軽量構成)・マーケティングランディングページ・OG 画像までを実装済。

<!-- TODO: Day 37 で本番ドメイン取得・Day 44 公開後にリンク差し替え -->

**本番サイト**: (Day 44 公開時に追加)
**デモ動画**: (Day 41 で Loom リンクを追加)

## スクリーンショット

<!-- TODO: pnpm dev で起動して撮影し、docs/screenshots/ に配置(Day 41) -->

| ランディング | ダッシュボード | AI 壁打ち |
| --- | --- | --- |
| _準備中_ | _準備中_ | _準備中_ |

| プロジェクト詳細 | LP ブロックエディタ | 公開 LP |
| --- | --- | --- |
| _準備中_ | _準備中_ | _準備中_ |

## プロダクトについて

### 誰のための SaaS か

- **個人開発者**: 副業 / 独立を視野に複数プロジェクトを管理したいエンジニア
- **小規模開発チーム(2〜10 人)**: 共同で個人発プロジェクト・ハッカソン作品・スタートアップ初期プロダクトを進めるチーム

### 何ができるか

- **マルチプロジェクト管理**: 複数の個人開発プロジェクトを並列で管理
- **AI 文書生成**: README / LP / 競合調査 / 告知文 / ロードマップ / リリースノート の 6 種を Claude Sonnet 4 + Tool Use で自動ドラフト
- **AI チェックリスト**: リリース前チェックリストの一括生成(Haiku 4.5) + 親タスクを最大 10 件のサブタスクに分解(TASK_SPLIT)
- **AI ドキュメント推敲**: 既存ドキュメントを Sonnet 4 で推敲し、append-only で新版を作成(REFINE_DOC、過去版は保持)
- **AI 壁打ち(RAG_QA)**: プロジェクト固有の文脈で対話、セッション履歴と参照元を永続化
- **過去資産の RAG**: 過去のプロジェクトドキュメントを pgvector でベクトル検索し、新規生成時にコンテキスト注入。コールドスタート対策として OSS README 6 件(Hono / Zod / Drizzle / Astro / tRPC / Trigger.dev、MIT / Apache-2.0)を seed コーパスとして同梱
- **LP ブロック化 + 公開 URL**: ランディングページを構造化ブロック(hero / features / stats / testimonial / cta / footer)で生成・編集、`/p/{slug}/{projectId}` で公開
- **チーム機能(Team プラン)**: メンバー招待 / 6 種ロール(OWNER / ADMIN / DEVELOPER / REVIEWER / TESTER / VIEWER)/ 共同編集 / レビュー / 監査ログ
- **Stripe セルフサーブ課金**: Customer Portal に委譲し、支払い方法 / 請求書履歴 / プラン変更 / 解約を完結

### プラン

| プラン | 料金 | 主な対象 |
| --- | --- | --- |
| **Free** | ¥0 | 個人開発者(AI 月 20 回まで) |
| **Pro** | ¥980 / 月 | 本格的に作る個人開発者(AI 無制限) |
| **Team** | ¥2,800 / 人・月 | 2 人以上のチーム(共同編集・レビュー・監査ログ) |

> プランの細目(メンバー上限・AI 上限など)は `docs/adr/004-billing-plans.md` および `docs/PROJECT_STATUS.md` §9.8 を参照。

## 技術スタック

| 領域 | 採用 |
| --- | --- |
| フロントエンド | Next.js 15(App Router) + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui |
| バックエンド | NestJS 11 + Prisma 6 |
| データベース | PostgreSQL 16 + pgvector |
| 認証 | Clerk |
| 決済 | Stripe Subscriptions + Customer Portal |
| AI | Anthropic API(Claude Sonnet 4 + Haiku 4.5)+ OpenAI(text-embedding-3-small) |
| メール | Resend + React Email |
| インフラ(Web) | Vercel |
| インフラ(API) | AWS App Runner + RDS PostgreSQL `db.t4g.micro` + fck-nat(NAT インスタンス) |
| IaC | Terraform(S3 state、ネイティブロック) |
| CI/CD | GitHub Actions + AWS OIDC |
| Monorepo | Turborepo + pnpm |

技術選定の理由は以下の ADR を参照してください。

- [ADR-001 技術スタック](./docs/adr/001-tech-stack.md)
- [ADR-010 IaC ツールに Terraform を採用](./docs/adr/010-iac-tool.md)
- [ADR-011 軽量 AWS 構成(App Runner + db.t4g.micro)](./docs/adr/011-lightweight-aws-architecture.md)

## アーキテクチャ

ADR-011 で確定した軽量 AWS 構成です。

- **Web**: Vercel(Next.js 15)
- **API**: AWS App Runner(コンテナ、VPC コネクタ経由で RDS にプライベート接続)
- **DB**: RDS PostgreSQL `db.t4g.micro`(pgvector、TLS 強制、マスターパスワードは Secrets Manager 管理)
- **外向き通信**: fck-nat の NAT インスタンス(`t4g.nano`)+ EIP
- **キュー / キャッシュ**: Upstash(Serverless Redis、必要時に導入)
- **監視**: CloudWatch アラーム + SNS 通知 + AWS Budgets

詳細は [docs/architecture.md](./docs/architecture.md) を参照してください。

## 必要な環境

- **Node.js**: 22 系(推奨: [mise](https://mise.jdx.dev) でバージョン管理、`.mise.toml` 参照)
- **pnpm**: 10 系(`packageManager` で固定済み、Corepack 経由で自動切替)
- **Docker Desktop**: ローカル PostgreSQL を起動するため

## セットアップ

```bash
# 1. リポジトリをクローン
git clone git@github.com:shintarokono-engineer/ship-yard.git
cd ship-yard

# 2. ツールバージョンを揃える(mise を使う場合)
mise install   # Node 22 + pnpm 10 を自動取得

# 3. 依存関係をインストール
pnpm install

# 4. ローカル DB の起動(PostgreSQL 16 + pgvector)
pnpm db:up
docker compose ps   # postgres が "healthy" であることを確認

# 5. 環境変数を設定
cp apps/web/.env.example   apps/web/.env.local
cp apps/api/.env.example   apps/api/.env.local
cp packages/db/.env.example packages/db/.env

# 6. DB マイグレーション適用 + Prisma Client 生成 + ビルド
pnpm db:setup    # generate + build
pnpm db:migrate  # migrations/ を適用

# 7. (任意)RAG seed コーパスを投入
pnpm --filter @shipyard/api seed-corpus:apply

# 8. lint / format / type-check
pnpm lint
pnpm format:check

# 9. 開発サーバー起動(Web 3000 / API 4000)
pnpm dev
```

### 環境変数

| ファイル | 主なキー |
| --- | --- |
| `apps/web/.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` / `API_URL` / `SITE_URL` |
| `apps/api/.env.local` | `DATABASE_URL` / `CLERK_SECRET_KEY` / `PORT` / `APP_BASE_URL` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAM` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `RESEND_API_KEY` / `MAIL_FROM` |
| `packages/db/.env` | `DATABASE_URL`(Prisma CLI 用) |

- Clerk: <https://clerk.com> で Application を作成
- Stripe: <https://dashboard.stripe.com>(テストモード)で Product / Price を作成
- Anthropic: <https://console.anthropic.com>
- OpenAI: <https://platform.openai.com>
- Resend: <https://resend.com>

Stripe / AI のキーが未設定でもアプリ自体は起動します(該当機能は使えません)。

### Stripe Webhook のローカルテスト

```bash
stripe login                                                # ブラウザで Stripe アカウントに接続
stripe listen --forward-to localhost:4000/webhooks/stripe   # 出力の whsec_... を apps/api/.env.local の STRIPE_WEBHOOK_SECRET に貼る
stripe trigger checkout.session.completed                    # 別ターミナルでイベントを発火
```

Checkout 動作確認は `POST /workspaces/{slug}/checkout-session`(Clerk JWT 必須・OWNER のみ)で URL を取得し、テストカード `4242 4242 4242 4242` で支払います。

## 利用可能な scripts

ルート `package.json` 経由で実行可能なコマンドです(`pnpm run` で一覧表示)。

### ビルド / lint / format / test

| コマンド | 内容 |
| --- | --- |
| `pnpm install` | 全 workspace の依存をインストール |
| `pnpm build` | Turborepo 経由で全 workspace の build を実行 |
| `pnpm test` | Turborepo 経由で全 workspace の test を実行 |
| `pnpm lint` | ESLint(`eslint .`)を実行 |
| `pnpm lint:fix` | ESLint の自動修正 |
| `pnpm format` | Prettier で自動整形 |
| `pnpm format:check` | Prettier の整形チェック(差分があれば exit 1) |
| `pnpm typecheck:api` | `apps/api` の TypeScript 型チェック |

### 開発サーバー

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | Turborepo 経由で `apps/web`(3000)+ `apps/api`(4000)を同時起動 |
| `pnpm dev:api` | `apps/api` だけを起動(NestJS watch モード) |
| `pnpm dev:web` | `apps/web` だけを起動 |

### DB(PostgreSQL + Prisma)

| コマンド | 内容 |
| --- | --- |
| `pnpm db:up` | Docker で PostgreSQL コンテナ起動 |
| `pnpm db:down` | DB コンテナ停止(ボリュームは保持) |
| `pnpm db:migrate` | Prisma マイグレーションを生成・適用 |
| `pnpm db:deploy` | 本番向け migration 適用(`migrate deploy`) |
| `pnpm db:gen` | Prisma Client + ER 図(`docs/data-model-erd.generated.md`)を生成 |
| `pnpm db:setup` | `generate` + `build`(初回セットアップ用) |
| `pnpm db:studio` | Prisma Studio を起動(http://localhost:5555) |

### 運用 / 補助

| コマンド | 内容 |
| --- | --- |
| `pnpm backfill <slug> <fallbackUserId>` | `embedding IS NULL` の ProjectDocument を OpenAI text-embedding-3-small で埋め直す(冪等) |
| `pnpm --filter @shipyard/api seed-corpus:apply` | RAG コールドスタート対策の OSS README 6 件を `SEED_PUBLIC` テナントへ冪等投入 |
| `pnpm --filter <pkg> <script>` | 任意 workspace の script を直叩き(上記エイリアスで間に合わない時のフォールバック) |

## モノレポ構造

```
shipyard/
├── apps/
│   ├── web/            @shipyard/web    Next.js 15 + Tailwind v4 + shadcn/ui + Clerk
│   └── api/            @shipyard/api    NestJS 11 + Prisma + Stripe + AI(Anthropic / OpenAI)
├── packages/
│   └── db/             @shipyard/db     Prisma 6 schema + Client + tenant 分離 Extension
├── infra/
│   ├── bootstrap/                       Terraform state 用 S3 バケット(初回 apply は local state)
│   └── prod/                            VPC / RDS / App Runner / Route53 / CloudWatch / OIDC(本番)
├── eslint-rules/                        独自 ESLint ルール(no-raw-sql-without-tenant-filter 等)
├── docs/                                ADR / 設計 / 運用ドキュメント
├── .github/workflows/                   CI(lint / format)+ deploy(main → App Runner)
└── docker-compose.yml                   ローカル DB(PostgreSQL + pgvector)
```

詳細は [ADR-006 モノレポ構成](./docs/adr/006-monorepo-structure.md) 参照。

## ドキュメント

| ファイル | 内容 |
| --- | --- |
| [docs/PROJECT_STATUS.md](./docs/PROJECT_STATUS.md) | プロジェクト全体の状況・決定事項・ロードマップ(Single Source of Truth) |
| [docs/OVERVIEW.md](./docs/OVERVIEW.md) | プロダクト概要(全体像を掴むエントリーポイント) |
| [docs/implementation-rules.md](./docs/implementation-rules.md) | マルチテナント / レイヤリング / 課金 / AI / 日付 / マジックナンバー等の横断的な実装制約 |
| [docs/architecture.md](./docs/architecture.md) | C4 Context / Container + 軽量 AWS デプロイ構成(ADR-011 反映) |
| [docs/data-model.md](./docs/data-model.md) | ER 図 + Prisma スキーマ + インデックス戦略(手動メンテの SSoT) |
| [docs/data-model-erd.generated.md](./docs/data-model-erd.generated.md) | `schema.prisma` から自動生成した Mermaid ER 図 |
| [docs/screen-flow.md](./docs/screen-flow.md) | 6 つの主要ユーザーフロー(オンボーディング / 招待 / 課金 など) |

### Architecture Decision Records(ADR)

| ADR | テーマ |
| --- | --- |
| [001](./docs/adr/001-tech-stack.md) | 技術スタック |
| [002](./docs/adr/002-multitenancy.md) | マルチテナント(Pool model + tenantId 自動注入) |
| [003](./docs/adr/003-tenant-resolution.md) | テナント解決(`/w/{slug}` サブパス + `X-Tenant-Slug`) |
| [004](./docs/adr/004-billing-plans.md) | 課金プラン(Free / Pro / Team、Team は Subscription Quantity) |
| [005](./docs/adr/005-ai-responsibility.md) | AI 機能の責任範囲・Tool Use / Sonnet 4 と Haiku 4.5 の使い分け |
| [006](./docs/adr/006-monorepo-structure.md) | モノレポ構成 |
| [007](./docs/adr/007-mail-provider.md) | メール基盤(Resend + React Email) |
| [008](./docs/adr/008-rag-corpus-strategy.md) | RAG コーパス戦略(seed テナント + 段階的拡張) |
| [009](./docs/adr/009-landing-page-block-architecture.md) | LP ブロック型アーキテクチャ |
| [010](./docs/adr/010-iac-tool.md) | IaC ツールに Terraform を採用 |
| [011](./docs/adr/011-lightweight-aws-architecture.md) | 軽量 AWS 構成(App Runner + db.t4g.micro + Upstash) |

ADR は承認済の方針を表すため、方針転換が必要な場合は新しい ADR を [docs/adr/000-template.md](./docs/adr/000-template.md) に従って起こします。

## CI / CD

GitHub Actions で以下を自動実行します。

- **CI**(`main` への push と PR ごと): ESLint チェック + Prettier フォーマットチェック
- **Deploy**(`main` → App Runner): AWS OIDC で短命クレデンシャル発行 → ECR push → App Runner デプロイ

詳細は [.github/workflows/](./.github/workflows/) を参照してください。

## ロードマップ

- ✅ Week 1〜3: 設計 / 基盤 / マルチテナント / Stripe / AI 基盤
- ✅ Week 4: AI 機能 UI / Stripe フロント / RAG コールドスタート対策 / RAG_QA / LP ブロック化
- ✅ Week 5: AWS インフラ(Terraform、ADR-011 軽量構成、`apply` は AWS アカウント作成後)
- 🚧 **Week 6**: マーケティング LP(✅ Day 40)/ README 強化 + デモ動画(🚧 Day 41)/ Zenn 記事 / 告知準備 / **Day 44 公開**

詳細は [docs/PROJECT_STATUS.md §6](./docs/PROJECT_STATUS.md) を参照してください。

## ライセンス

[MIT License](./LICENSE)
