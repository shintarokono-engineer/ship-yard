# ディレクトリ構成

このドキュメントは Shipyard モノレポの実装現状を反映した **実用リファレンス** です。
「どこに何があるか」「新規ファイルはどこに置くべきか」を素早く判断できることを目的としています。**設計判断の背景は ADR を参照**してください(本書では結論と運用ルールのみ扱います)。

---

## 1. 全体像

```
shipyard/
├── apps/
│   ├── web/                  # Next.js 15 (App Router) フロントエンド
│   └── api/                  # NestJS 11 バックエンド
├── packages/
│   ├── db/                   # Prisma スキーマ + Client(全 consumer 共有)
│   └── types/                # フロント↔バック共通型(現状 placeholder)
├── docs/                     # 設計ドキュメント(本書を含む)
│   └── adr/                  # 採択済み設計判断(001〜007)
├── eslint-rules/             # プロジェクト固有 ESLint カスタムルール
├── .claude/                  # Claude Code 設定(agents / skills / settings)
├── .github/workflows/        # GitHub Actions(CI)
├── docker-compose.yml        # ローカル PostgreSQL 16 + pgvector
├── turbo.json                # Turborepo タスク定義
├── pnpm-workspace.yaml       # workspace 宣言
├── tsconfig.base.json        # 共通 TS 設定(各 workspace で extends)
├── eslint.config.js          # Flat Config(全 workspace 横断)
├── .prettierrc.json
├── .mise.toml / .nvmrc       # Node 22 + pnpm 10 のバージョン固定
├── CLAUDE.md                 # Claude Code 向けプロジェクト指示
└── README.md
```

### 階層の責務

| 階層        | 性質                                            | 中身                                | 依存方向                                       |
| ----------- | ----------------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| `apps/`     | **実行可能アプリケーション**(プロセスを起動)  | `web` / `api`                       | `apps/* → packages/*` のみ                     |
| `packages/` | **共有ライブラリ**(他から import される)      | `db` / `types`                      | `packages/*` から `apps/*` への依存禁止        |

> 詳細: [ADR-006: モノレポのディレクトリ構成と DB 層の配置](./adr/006-monorepo-structure.md)

---

## 2. apps/

### 2-1. `apps/web/`(Next.js フロントエンド)

Next.js 15 App Router + React 19 + Tailwind CSS v4 + shadcn/ui + Clerk。

```
apps/web/src/
├── app/                                  # App Router(ルーティング)
│   ├── layout.tsx                        # RootLayout(ClerkProvider + Toaster)
│   ├── page.tsx                          # /(ランディング)
│   ├── sign-in/, sign-up/                # Clerk catch-all
│   └── w/[slug]/                         # ワークスペース配下(ADR-003 サブパス方式)
│       ├── layout.tsx                    # 所属チェック + ヘッダー
│       ├── page.tsx                      # ダッシュボード(プロジェクト一覧)
│       ├── _actions/                     # Server Actions(Private Folder)
│       └── _components/                  # ページ専用部品(Private Folder)
├── components/
│   └── ui/                               # shadcn/ui からコピーした汎用 UI 部品
├── lib/
│   ├── api/                              # apps/api へのクライアント(Clerk JWT 付与)
│   │   ├── client.ts                     # 共通 fetch ラッパー(import 'server-only')
│   │   ├── errors.ts                     # ApiError + バリデーション抽出
│   │   ├── types.ts                      # Workspace / Project / enum 文字列
│   │   └── workspaces.ts                 # /workspaces 配下のエンドポイント関数
│   ├── format.ts                         # 日付フォーマット(Asia/Tokyo 固定)
│   ├── tenant-slug.ts                    # slug 形式バリデーション
│   └── utils.ts                          # cn() ヘルパー
└── middleware.ts                         # Clerk 認証 + X-Tenant-Slug 伝搬
```

#### 配置ルール

- ページから apps/api を叩くときは **必ず `lib/api/` のラッパー経由**(直接 fetch しない)
- 認証付き fetch を扱うモジュールは **`import 'server-only'`** で先頭マーカーを打つ(Client にバンドルされたら構造的エラー)
- ページ固有の部品は `app/<route>/_components/`、Server Action は `_actions/`(`_` プレフィックスは Next.js Private Folder = ルート除外)
- 複数ページで使う UI は `components/`、shadcn 由来は `components/ui/`
- shadcn はコピー型: `pnpm dlx shadcn@latest add <name>` で `components/ui/` に追加。コピー後は編集自由
- `<body>` には固定属性のみ(`suppressHydrationWarning` の前提、CLAUDE.md フロントエンド節)
- 日付・時刻は `lib/format.ts` の `Intl.DateTimeFormat`(`timeZone: 'Asia/Tokyo'` 固定)

> 関連:
> - Server / Client Component の使い分け: 学習ノート `Web開発/Next.js.md`
> - ADR-003: `/w/{slug}` サブパス方式

### 2-2. `apps/api/`(NestJS バックエンド)

NestJS 11 + Express 5 + Prisma 6 + Clerk JWT + Stripe + Anthropic / OpenAI。

```
apps/api/src/
├── main.ts                  # ブートストラップ(rawBody=true, ValidationPipe)
├── app.module.ts
├── auth/                    # ClerkAuthGuard / WorkspaceGuard / @Roles / @CurrentWorkspace
├── prisma/                  # PrismaModule / PrismaService(@Global)
├── tenant/                  # TenantMiddleware(X-Tenant-Slug → ALS テナントコンテキスト)
├── common/                  # time.ts (dayjs UTC) / validators / etc.
├── workspaces/              # GET /workspaces/:slug, /checkout-session, MembershipService
├── projects/                # Project CRUD(controller / service / dto)
├── checklist/               # ChecklistItem CRUD + 一括生成
├── documents/               # ProjectDocument 閲覧 / 編集(append-only) / soft delete
├── ai/                      # AI 関連の全モジュール
│   ├── ai.constants.ts                   # モデル ID / 上限 / 単価 / 為替の集約
│   ├── ai-usage.service.ts               # AIUsage 記録 + Free 月次上限チェック
│   ├── anthropic.{module,service}.ts     # Claude SDK ラッパー
│   ├── openai.{module,service}.ts        # OpenAI SDK ラッパー(embedding)
│   ├── embedding.service.ts              # ProjectDocument.embedding の埋め込み
│   ├── draft-gen.{controller,service}.ts # README/LP 生成(Sonnet 4 + Tool Use)
│   └── checklist-gen.{controller,service}.ts # チェックリスト一括生成(Haiku 4.5)
├── billing/                 # Stripe ↔ DB 同期(BillingService)
├── stripe/                  # Stripe SDK ラッパー
└── webhooks/                # POST /webhooks/stripe(署名検証 + Idempotency)
```

#### 配置ルール

- **コントローラから `prisma.*` 直叩き禁止**。永続化と `tenantId` 注入は Service 層に集約(CLAUDE.md 「レイヤリング」)
- 認証 + 所属解決 + ロール検証は `@UseGuards(ClerkAuthGuard, WorkspaceGuard)` + `@Roles(...)` で宣言的に
- path slug ベース(`workspaces/:slug/...`)は ALS テナントコンテキストを持たない。Service は引数の `tenantId` を `where`/`data` に明示注入
- Raw SQL は原則禁止、必要時は `WHERE tenantId = $1` 明示(ESLint `no-raw-sql-without-tenant-filter` で検出)
- 日付・時刻は `common/time.ts` の dayjs(UTC プラグイン extend 済み)を使う(`new Date(...)` での日付演算は避ける)
- 上限・モデル ID・単価・為替・タイムアウト等の変動値は定数ファイルに集約(AI 関連は `ai/ai.constants.ts`)
- schema 由来 enum はマジック文字列ではなく `@shipyard/db` 経由(`Plan.PRO` 等)で参照

> 関連: ADR-002(マルチテナント)/ ADR-004(課金)/ ADR-005(AI)

---

## 3. packages/

### 3-1. `packages/db/`(Prisma)

```
packages/db/
├── prisma/
│   ├── schema.prisma        # 全モデル定義(SSoT、ER は data-model.md 参照)
│   └── migrations/          # マイグレーション履歴
├── src/
│   ├── index.ts             # 公開 API(PrismaClient + 拡張 + enum re-export)
│   ├── tenant-context.ts    # AsyncLocalStorage ベースのテナントコンテキスト
│   ├── tenant-extension.ts  # Prisma Client Extension(tenantId 自動注入、ADR-002)
│   └── prisma-errors.ts     # PrismaErrorCode 定数 + isPrismaError 型ガード
├── package.json             # main: dist/index.js, types: dist/index.d.ts
└── tsconfig.json
```

#### 配置ルール

- **`dist/` がビルド成果物**。worktree 追加直後や clean 直後は `pnpm --filter @shipyard/db build` が必須(これを忘れると consumer が `Cannot find module '@shipyard/db'` で落ちる)
- schema を変更したら `pnpm --filter @shipyard/db generate` で Prisma Client 再生成 + `migrate dev` で migration を作成
- Pool model + tenantId 自動注入の **真実の源** はここ。consumer は extension を必ず通す

> 関連: ADR-002 / `docs/data-model.md`

### 3-2. `packages/types/`

フロント↔バック共通の型を置く workspace。**現状は `package.json` のみで `src/` 未作成**。

将来予定: `@shipyard/db` の enum 文字列(`ProjectStatus` / `Plan` / `Role` / `DocType` / `Category` / `Feature`)を共通定数化し、`apps/web` も型のみ参照可能にする。現状は `apps/web/src/lib/api/types.ts` で重複定義(冒頭 TODO 参照)。

---

## 4. docs/

設計ドキュメント。基本は `PROJECT_STATUS.md`(SSoT)から辿る。

| ファイル                          | 役割                                                      |
| --------------------------------- | --------------------------------------------------------- |
| `PROJECT_STATUS.md`               | プロジェクト全体の現状 / ロードマップ(**SSoT**)         |
| `OVERVIEW.md`                     | プロダクト概要(まず読む)                                |
| `GOALS.md`                        | プロジェクトゴール                                        |
| `architecture.md`                 | C4 Context/Container + AWS デプロイ構成                   |
| `data-model.md`                   | ER + Prisma スキーマ + インデックス戦略                   |
| `data-model-erd.generated.md`     | schema.prisma から自動生成(Mermaid ER)                  |
| `screen-flow.md`                  | 6 つの主要ユーザーフロー                                  |
| `setup-vercel.md`                 | Vercel セットアップ手順                                   |
| `directory-structure.md`          | **本ファイル**                                            |
| `adr/000-template.md`             | ADR テンプレート                                          |
| `adr/001-tech-stack.md`           | 技術スタック選定                                          |
| `adr/002-multitenancy.md`         | マルチテナント分離方式(Pool model)                      |
| `adr/003-tenant-resolution.md`    | テナント解決方式(サブパス方式)                          |
| `adr/004-billing-plans.md`        | 課金プランと Stripe 連携                                  |
| `adr/005-ai-responsibility.md`    | AI 機能の責務分担                                         |
| `adr/006-monorepo-structure.md`   | モノレポのディレクトリ構成と DB 層の配置                  |
| `adr/007-mail-provider.md`        | メール送信基盤(Resend を MVP 採用)                     |

ADR は **承認済み = 勝手に覆さない**。方針転換時は `adr/000-template.md` に従って新 ADR を起こす。

---

## 5. ルート直下の設定ファイル

| ファイル                                    | 用途                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm-workspace.yaml`                       | `apps/*` と `packages/*` を workspace 対象として宣言                       |
| `turbo.json`                                | Turborepo タスク定義(`build` / `dev` / `lint` / `test`)                  |
| `tsconfig.base.json`                        | 共通 TS 設定。各 workspace が `extends` する                               |
| `eslint.config.js`                          | Flat Config(全 workspace 横断、`eslint-rules/` のカスタムルールも適用)   |
| `.prettierrc.json` / `.prettierignore`      | フォーマッタ設定                                                           |
| `.mise.toml` / `.nvmrc`                     | Node 22 + pnpm 10 のバージョン固定                                         |
| `docker-compose.yml`                        | ローカル PostgreSQL 16 + pgvector                                          |
| `CLAUDE.md`                                 | Claude Code 向けプロジェクト指示(コーディング規約)                       |
| `README.md`                                 | リポジトリ入口                                                             |

### `eslint-rules/`

プロジェクト固有 ESLint カスタムルール。

| ルール                              | 役割                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `no-raw-sql-without-tenant-filter.js` | Raw SQL に `tenantId` フィルタが無いものを検出(ADR-002 のテナント漏洩防止) |

### `.claude/`

Claude Code(AI ペアプロ)の設定 / agents / skills を集約。チームで共有。`claude-template` から派生。

| サブディレクトリ / ファイル | 役割                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| `agents/`                   | サブエージェント定義(planner / code-reviewer / debugger 等)        |
| `skills/`                   | スキル定義(`/understanding-ticket`, `/reviewing-own-changes` 等)   |
| `settings.json`             | 共有設定(コミット対象)                                            |
| `settings.local.json`       | 個人ローカル設定(`.gitignore` 対象)                               |
| `output/`                   | スキル実行結果の出力先(git 管轄外)                                |

### `.github/workflows/`

GitHub Actions の CI 定義。main への push / PR で lint + format チェック。

---

## 6. 守るべき配置ルール(集約)

新規ファイルを足すときに迷ったら、ここを見て判断します。

1. **依存方向**: `apps/* → packages/*` の片方向のみ。`apps/* → apps/*` および `packages/* → apps/*` は禁止(ADR-006)
2. **ページ固有 vs 共通の境界**:
   - ページ固有 → `apps/web/src/app/<route>/_components/` または `_actions/`(`_` プレフィックスでルート除外)
   - 複数ページで使う UI → `apps/web/src/components/`
   - shadcn 由来の汎用 UI → `apps/web/src/components/ui/`
3. **API クライアント**: web から apps/api を叩くときは必ず `apps/web/src/lib/api/` のラッパー経由(直接 fetch 禁止)
4. **server-only モジュール**: 認証 / 秘密情報 / DB アクセスを含むコードは `import 'server-only'` で先頭マーカーを打つ
5. **DB 操作**: API は必ず Service 層を経由。Raw SQL は `WHERE tenantId = $1` を明示
6. **マジックナンバー禁止**: 上限値・モデル ID・単価・為替・タイムアウト等は定数ファイルに集約
7. **日付**: API は `common/time.ts` の dayjs 経由、Web は `lib/format.ts` の `Intl.DateTimeFormat`(`Asia/Tokyo` 固定)
8. **enum**: schema 由来 enum はマジック文字列を書かず、API は `@shipyard/db`、Web は `lib/api/types.ts`(将来は `packages/types`)を経由
9. **`<body>` には固定属性のみ**(CLAUDE.md フロントエンド節)

---

## 7. 関連ドキュメント

| 知りたいこと                     | 参照先                                                                 |
| -------------------------------- | ---------------------------------------------------------------------- |
| 現状と次の作業                   | `docs/PROJECT_STATUS.md`                                               |
| プロダクトの概要                 | `docs/OVERVIEW.md`                                                     |
| アーキテクチャ全体図             | `docs/architecture.md`                                                 |
| DB スキーマ                      | `docs/data-model.md` / `docs/data-model-erd.generated.md`              |
| 画面遷移                         | `docs/screen-flow.md`                                                  |
| 個別の設計判断                   | `docs/adr/*`                                                           |
| コーディング規約 / 制約          | `CLAUDE.md`                                                            |
| Next.js App Router の汎用知識   | 学習ノート vault: `Web開発/Next.js.md`(個人 Obsidian、本リポジトリ外) |
