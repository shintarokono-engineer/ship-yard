# Shipyard プロジェクト ステータスドキュメント

**最終更新**: 2026-05-13
**現在のフェーズ**: Week 2 進行中(Day 8 完了)。embedding 挿入は OpenAI キー未用意のため保留中

---

## 0. このドキュメントについて

Shipyard プロジェクトの単一の真実の源(Single Source of Truth)。これを読めば現状・決定事項・次にやることが全て把握できる状態を維持する。

### 更新ルール

- 重要な決定が出たら即時追記する
- Day を完了したら「完了済み deliverable」と「ロードマップ」を更新する
- 大きな方針転換があれば「変更履歴」に記録する
- ファイル冒頭の「最終更新」日付も更新する

### 別の Claude セッションで再開する場合

このドキュメントを最初に貼り付けて「Shipyard プロジェクトの続きをやりたい。このドキュメントが現状」と伝えれば、コンテキストを引き継いで再開できる。

---

## 1. プロジェクト概要

### プロダクト名

**Shipyard**(船渠)

### ワンライナー

個人開発者および小規模開発チーム向けの、「アイデア → 設計 → 開発 → リリース → 初期ユーザー獲得」までを一元管理する AI 支援付き B2B SaaS。

### ターゲット

- **個人開発者**: 副業/独立を視野に複数プロジェクトを管理したいエンジニア
- **小規模開発チーム(2〜10人)**: 共同で個人発プロジェクト・ハッカソン作品・スタートアップ初期プロダクトを進めるチーム
- 共通の課題: リリースまでの工程を効率化したい、過去経験を資産化したい、AI で雑務を減らしたい

### 提供価値

- 競合調査・LP・README・告知文を AI で自動ドラフト
- 過去プロジェクトの知見をベクトル検索で再活用(独自性)
- リリース前チェックリストの自動生成
- マルチプロジェクト並列管理
- **チーム機能**: メンバー招待・ロール管理(6 種)・共同編集・レビュー・監査ログ(Team プラン)

### 開発ゴール

- **3 週間で MVP リリース**(参画待ち期間に集中作業)
- リリース後も本業の合間に育てる(週 12 時間想定)
- 副業面談材料化(マルチテナント+Stripe+AI のフルセット経験を語れる状態)
- 将来的な収益化(Pro プラン課金で月数万円 → ロードスター資金へ)

---

## 2. ユーザーコンテキスト(abcw の状況)

### 基本情報

- 名前: abcw(Shintaro Kono / 河野慎太郎)
- 年齢: 27 歳
- 居住地: 福岡(出身は神奈川)
- 職業: SES エンジニア(Def tribe 所属、2026 年 5 月 1 日入社)
- 経験年数: 約 1.5〜2 年

### 現職

- 会社: Def tribe(SES、2026/05/01 入社)
- 案件: 参画待ち(2〜3 週間)、参画後は SKY プロジェクト関連の予定
- スタック: TypeScript / React / Next.js / GraphQL BFF / gRPC / NestJS
- 役割: 前職(FOXHOUND)で SKY 案件のチームリーダー経験あり

### この期間の作業時間

- 参画待ち期間中: フルタイム相当(週 40 時間使える)
- 参画開始後: 週 12 時間(副業に使える時間)

### 目的

- ロードスター(中古 ND)を約 1 年で現金購入する資金作り
- 副業(まずクラウドワークス → 後にエージェント案件)で実績作り
- テックリード/リードエンジニア志向のキャリア形成

### 強み

- 現職で SKY 案件のチームリーダー
- Claude Code の活用に習熟(SubAgent、Skills、RIPER ワークフロー等)
- TypeScript/Next.js/NestJS の実務経験
- 副業面談で語れるドメイン経験あり

### 制約・志向

- 文書は**ですます調**を好む
- 簡潔な出力を好む
- 週次報告は Claude で下書きしている
- 趣味: 読書(村上春樹・カズオイシグロ)、映画、ゲーム

---

## 3. 制約と前提条件

### 絶対に避ける条件(題材選定時に確認済み)

- **前職と類似ドメイン**: 予実管理・経理系は規約抵触リスクで NG
- **既存大手と直接競合**: Notion AI / Mem.ai / Reor のような飽和領域は NG
- **自身が使わない題材**: ドッグフーディングできないものは NG
- **3 週間で完成しないスコープ**: 機能スコープを膨らませすぎない

### 副業マーケット要件(リサーチ済み)

- **マルチテナント設計経験**は B2B SaaS 案件で必須級
- **Stripe Webhook 経験**は強く推奨
- **TypeScript + Next.js + NestJS** が市場の 8 割超でデファクト
- **AI/LLM 機能の業務組み込み経験**は加点要素
- 実務経験 2〜3 年が公開案件の最低ライン → ポートフォリオで補強する

### Shipyard が満たす要件

- マルチテナント: ワークスペース=テナントで自然に成立
- Stripe: 3 プラン(Free/Pro/Team)、人数課金あり
- AI: 6 場面で組み込み、独自性は「過去プロジェクト RAG」
- フルスタック: Next.js + NestJS + AWS デプロイ

---

## 4. 主要な決定事項のログ

### 4.1 題材選定(数回の議論を経て確定)

検討経緯:

1. **案 B(読書ログ+AI 対話)**: 棄却 → B2B SaaS 不向き、マルチテナント不自然
2. **案 J(フリーランス案件管理)**: 候補化 → board 等の競合あり
3. **案 M+(技術ナレッジ管理)**: 棄却 → Notion AI / Reor / Mem.ai と直接競合(レッドオーシャン)
4. **案 AA(個人開発リリース支援)**: ★ 採用

採用理由:

- abcw 自身が「これから個人開発する」当事者になる
- 大手競合が空白(ProductHunt は発見、Notion は汎用、IndieHackers はコミュニティのみ)
- マルチテナント+Stripe+AI 全部自然に組み込める
- 3 週間 MVP スコープに収まる

### 4.2 技術スタック(ADR-001)

| 領域              | 採用                                                               |
| ----------------- | ------------------------------------------------------------------ |
| フロント          | Next.js (App Router) + TypeScript + Tailwind CSS                   |
| バックエンド      | NestJS + Prisma                                                    |
| DB                | PostgreSQL 16 + pgvector                                           |
| 認証              | Clerk                                                              |
| 決済              | Stripe Subscriptions                                               |
| インフラ          | Vercel(フロント) + AWS ECS Fargate(API) + RDS Aurora Serverless v2 |
| AI                | Anthropic API(Claude Sonnet 4 + Haiku 4.5)                         |
| キュー/キャッシュ | Redis(ElastiCache)+ BullMQ                                         |
| ストレージ        | S3                                                                 |

### 4.3 マルチテナント方式(ADR-002)

- **Pool model** を採用(全テナント共有 DB、tenantId カラム識別)
- Prisma Client Extension で tenantId 自動注入
- AsyncLocalStorage でリクエストコンテキスト伝搬
- Raw SQL は禁止、ESLint カスタムルールで検出

### 4.4 テナント解決方式(ADR-003)

- **サブパス方式**(`shipyard.app/w/{slug}`)
- サブドメイン方式は SSL/DNS 管理コストで棄却
- 将来カスタムドメイン対応の余地は残す

### 4.5 課金プラン(ADR-004)

| プラン | 月額      | 制限                                      |
| ------ | --------- | ----------------------------------------- |
| Free   | ¥0        | 1 ワークスペース、3 メンバー、AI 月 20 回 |
| Pro    | ¥980      | 無制限 + AI 無制限                        |
| Team   | ¥2,800/人 | + 共同編集、レビュー、監査ログ            |

- Stripe Checkout(リダイレクト型)で実装
- Webhook Idempotency は `event.id` で担保
- 解約後 7 日 grace → 30 日凍結 → 削除

### 4.6 AI 戦略(ADR-005)

- **Sonnet 4**: 競合調査、ドキュメント生成、RAG QA
- **Haiku 4.5**: タスク分解、チェックリスト生成、文章推敲
- Tool Use は構造化出力が必要な場面のみ
- pgvector + text-embedding-3-small(1536 次元)で RAG
- AIUsage テーブルでテナント単位のコスト記録

---

## 5. 完了済み deliverable

### Day 1: 設計ドキュメント①(ADR 5本)

- `docs/adr/000-template.md` - ADR テンプレート
- `docs/adr/001-tech-stack.md` - 技術スタック選定
- `docs/adr/002-multitenancy.md` - マルチテナント分離方式
- `docs/adr/003-tenant-resolution.md` - テナント解決方式
- `docs/adr/004-billing-plans.md` - 課金プラン構造と Stripe 連携
- `docs/adr/005-ai-responsibility.md` - AI 機能の責務分担

### Day 2: 設計ドキュメント②(ER・C4・画面遷移)

- `docs/data-model.md` - ER 図 + Prisma スキーマ全文 + インデックス戦略
- `docs/architecture.md` - C4 Context + Container + デプロイ構成
- `docs/screen-flow.md` - 6 つの主要フロー(オンボーディング、プロジェクト作成、招待、課金、AI 生成、ワークスペース切替)

### Day 3: 開発環境セットアップ

- Turborepo + pnpm workspaces による monorepo(`apps/web` / `apps/api` / `packages/db` / `packages/ui` / `packages/types`)
- mise + pnpm 10 + Node 22 のバージョン固定(`.mise.toml` / `.nvmrc` / `packageManager`)
- Docker Compose で PostgreSQL 16 + pgvector(`docker-compose.yml`、`vector` 拡張インストール済み)
- TypeScript strict 設定(`tsconfig.base.json`、各 workspace で extends)
- ESLint 9 Flat Config + Prettier(`eslint.config.js` + `.prettierrc.json`、CI 連携)
- GitHub Actions CI(`.github/workflows/ci.yml`、main への push と PR で lint + format チェック自動実行)
- ADR-006: モノレポ構成(`docs/adr/006-monorepo-structure.md`)
- README.md / docs/OVERVIEW.md / docs/setup-vercel.md 整備

### Day 4: フロントエンド基盤(Next.js + 認証)

- `apps/web` に Next.js 15 (App Router) + React 19 + TypeScript 雛形導入
- Tailwind CSS v4(`@theme inline` の 3 層構造で shadcn のテーマ tokens を Tailwind に注入)
- shadcn/ui 初期セットアップ(new-york style、`components.json` + `cn()` ヘルパー + Button、以降 `pnpm dlx shadcn@latest add` で追加可能)
- Clerk 認証統合(`<ClerkProvider>` + middleware + `/sign-in` `/sign-up` catch-all + `<UserButton>`、`apps/web/.env.example`)
- `/w/{slug}` ワークスペースルーティング雛形(ADR-003 サブパス方式の Web 側、middleware で `X-Tenant-Slug` ヘッダーを下流伝搬、slug 形式バリデーション)
- Vercel に Production / Preview デプロイ動作確認(`ship-yard-web.vercel.app`、Clerk 環境変数 6 個登録済み)
- 既定ブランチを `master` から `main` に rename(GitHub / CI / docs / Vercel すべて整合)
- CLAUDE.md の制約セクションに「フロントエンド: `<body>` への動的属性禁止」運用ルール追加(suppressHydrationWarning と `<body>` の関係)

### Day 5: マルチテナント基盤(NestJS + Prisma + Clerk JWT)

**Phase A — NestJS / Prisma 雛形 + スキーマ + マイグレーション**

- `apps/api` に NestJS 11 + Express 5 雛形(`/health` エンドポイント、port 4000、`tsconfig.base.json` 継承)
- `packages/db` に Prisma 6 雛形(`dist/` ビルド配布、`main: dist/index.js`、PrismaClient シングルトン)
- `docs/data-model.md` の全 9 enum + 10 model を `schema.prisma` に実装
- ローカル DB に初回マイグレーション適用(11 tables + pgvector 拡張 + 11 index)+ HNSW インデックス(`ProjectDocument.embedding`、cosine)を raw SQL migration で追加
- `prisma-erd-generator` で `docs/data-model-erd.generated.md`(Mermaid)を自動生成

**Phase B — マルチテナントランタイム(ADR-002)**

- `apps/api` に `PrismaModule` / `PrismaService`(`@Global`、`OnModuleInit/Destroy` で connect/disconnect)
- `packages/db/src/tenant-context.ts`: AsyncLocalStorage ベースの `TenantContext`(`runWithTenant` / `getTenantId` / `getTenantIdOrThrow`)
- `apps/api` の `TenantMiddleware`: `X-Tenant-Slug` ヘッダー → `Tenant.findUnique` で `tenantId` 解決 → `runWithTenant` で包む。ヘッダー無しは素通し、slug 不在は 404
- Prisma Client Extension(`packages/db/src/tenant-extension.ts`): 業務テーブル(Project / ChecklistItem / ProjectDocument / AIUsage / InvitationToken)の query に `tenantId` を自動注入。`User` / `WebhookEvent` は対象外、`TenantMember` / `Subscription` は別扱い
- ESLint カスタムルール `shipyard/no-raw-sql-without-tenant-filter`(`eslint-rules/`): raw SQL に `tenantId` フィルタが無いものを検出

**Phase C — Clerk JWT 認証 + Web 統合(ADR-003)**

- `apps/api` の `ClerkAuthGuard`(`@clerk/backend` の `verifyToken` で `Bearer` JWT 検証)+ `@CurrentUser()` パラメータデコレータ
- `apps/api` に `GET /workspaces/:slug`(認証 → Tenant 解決 → `TenantMember` 確認 → 所属なし / slug 不在は 404、所属していれば `{ id, slug, name, plan, role }`)
- `apps/api` に `@nestjs/config`(`ConfigModule.forRoot` で `.env.local` 読み込み)、`apps/api/.env.example`
- `apps/web/src/app/w/[slug]/page.tsx`: `auth().getToken()` で JWT 取得 → `GET ${API_URL}/workspaces/:slug` を呼び、404 なら `notFound()`(Day 4 の `// TODO` を消化)
- `apps/web/.env.example` に `API_URL` を追加
- 学習ノート vault に `データベース/Prisma.md` / `バックエンド/NestJS.md` を作成(普遍的知識のみ、shipyard 固有は除外)

### Day 6: Stripe 基盤(課金、ADR-004)

- `apps/api` に Stripe SDK(`stripe` v22)統合 — `StripeModule` / `StripeService`(`STRIPE_SECRET_KEY` で初期化、Price ID / Webhook 署名シークレット解決ヘルパー、`stripe.types.ts` で名前空間型シム)
- Stripe Dashboard(テストモード)に Product / Price を作成:`Shipyard Pro`(¥980/月)/ `Shipyard Team`(¥2,800/月)
- `POST /webhooks/stripe`(`WebhooksController`)— `main.ts` で `rawBody: true`、`stripe-signature` ヘッダー + `constructEvent` で署名検証(不正→400 = Stripe 再送なし / 処理失敗→500 = Stripe 再送あり)
- `StripeWebhookService` — Idempotency(`WebhookEvent.stripeEventId` ユニーク制約、PROCESSED 済みはスキップ、失敗時 FAILED 記録 + re-throw)+ イベント種別の分岐
- `BillingService` — Stripe ↔ DB 同期:Stripe Customer 確保(`ensureStripeCustomer`、Free でも Customer 作成)/ Checkout Session 作成(`createCheckoutSession`、TEAM は quantity=メンバー数)/ 5 イベント処理(`checkout.session.completed` / `customer.subscription.created`・`updated` / `customer.subscription.deleted` / `invoice.paid` / `invoice.payment_failed`)→ `Subscription` upsert + `Tenant.plan` 同期。tenantId は Stripe metadata から解決(Webhook は ALS テナントコンテキスト無しの例外ルート)
- `POST /workspaces/:slug/checkout-session`(`WorkspacesController`)— 認証 + 所属チェック + OWNER のみ(プラン変更権限は OWNER のみ、Role 定義)。プラン(PRO / TEAM)を受け取り Checkout URL を返す
- ローカル E2E 確認:`stripe-cli`(`stripe listen` + `stripe trigger` + テストカード `4242...` での実 Checkout)で、署名検証 / 冪等記録 / 重複スキップ / Checkout 完了 → `Tenant.plan` が `FREE`→`PRO` / 解約 → `FREE`/`CANCELED` への復帰を確認

### Day 7: AI 基盤 + 最初の AI 機能(ADR-005)

- `apps/api` に Anthropic SDK(`@anthropic-ai/sdk`)統合 — `AnthropicModule` / `AnthropicService`(`ANTHROPIC_API_KEY` で初期化)、`apps/api/.env.example` に `ANTHROPIC_API_KEY`
- `AIUsageService`(`AIUsage` 記録 + Free プランの月次上限チェック、ADR-005)— `assertWithinFreeQuota`(FREE のとき当月の `AIUsage` 件数 ≥ 20 で 403)、`record`(`model` / `feature` / `tokensIn`・`tokensOut` / `costJpy` の見積)
- 最初の AI 機能:`POST /workspaces/:slug/projects/:projectId/documents/generate`(`DraftGenController`)— 認証 + 所属チェック + 書き込みロール(DEVELOPER 以上)+ Free 上限チェック → `DraftGenService` が Sonnet 4 + **Tool Use**(`submit_document` を `tool_choice` で強制)で README / LANDING_PAGE のドラフトを構造化生成 → `ProjectDocument` 保存(`version` インクリメント、`embedding` は後続)→ `AIUsageService.record`
- ローカル E2E 確認:実 Claude API で README を生成 → `ProjectDocument`(version 1)+ `AIUsage`(claude-sonnet-4-6 / DRAFT_GEN / 991+1129 tokens / ¥2.99)が作られることを DB で確認。無認証 → 401
- AI 関連の調整可能値を `apps/api/src/ai/ai.constants.ts` に集約(モデル ID / Free 上限 / 単価 / 為替)
- リファクタ:所属チェックを `MembershipService.resolveAccess(slug, clerkUserId)` に共通化(`WorkspacesController` / `DraftGenController` で共用)、schema enum を `@shipyard/db` 経由で参照(マジック文字列廃止)、日付処理を `dayjs` に統一(`apps/api/src/common/time.ts` で UTC プラグインを extend)、CLAUDE.md に「日付・時刻の扱い」「マジックナンバー/設定値」ルールを追記
- ADR-007(メール送信基盤)を起こした(§9.2 の宿題消化 — Resend を MVP 採用)
- 学習ノート vault に `バックエンド/Stripe.md`(Day 6 分)/ `バックエンド/Anthropic API.md` を作成、`データベース/Prisma.md` にクエリメソッド・where 演算子の章を追記
- **繰越**: pgvector への embedding 挿入(OpenAI `text-embedding-3-small`、`ProjectDocument.embedding`)は OpenAI キー未用意のため Week 2(RAG 実装)へ

### Day 8: コアエンティティ CRUD①(Project + ProjectDocument 閲覧)+ API 基盤の整備

- **リクエストバリデーション**: `apps/api` に `class-validator` + `class-transformer` を導入し、`main.ts` でグローバル `ValidationPipe`(`whitelist` / `forbidNonWhitelisted` / `transform`)。全リクエスト入力(body / query)を DTO クラスで宣言的に検証(`@IsEnum` だと全値を許す箇所は `@IsIn([...])` で部分集合に絞る)→ 未知プロパティ・不正値は 400
- **Project の CRUD**(`apps/api/src/projects/`、`ProjectsController` + `ProjectsService` + DTO):`POST /workspaces/:slug/projects`(作成、DEVELOPER 以上)/ `GET /workspaces/:slug/projects[?status=]`(一覧、メンバー全員、子要素件数付き)/ `GET .../:projectId`(取得)/ `PATCH .../:projectId`(部分更新、DEVELOPER 以上)/ `DELETE .../:projectId`(削除 204、ADMIN 以上、子リソースは schema の `onDelete: Cascade` で連鎖)
- **ProjectDocument の閲覧**(`apps/api/src/documents/`、`DocumentsController` + `DocumentsService`):`GET .../documents[?type=]`(一覧、本文 `content` なし)/ `GET .../documents/:documentId`(1 件、本文込み)。ドキュメントの**作成**は Day 7 の AI 生成エンドポイント(`ai/draft-gen.controller.ts`)が担う(`DocumentsService.createDraft` 経由に整理)
- **RBAC ガード化**(`apps/api/src/auth/`):`@Roles(...)`(`SetMetadata`)+ `WorkspaceGuard`(所属解決 → 404 / `@Roles` 照合 → 403 / `req.workspaceAccess` セット)+ `@CurrentWorkspace()` パラメータデコレータ。各コントローラは `@UseGuards(ClerkAuthGuard, WorkspaceGuard)` + `@Roles(...WRITER_ROLES)` 等で宣言的に。`DraftGenController` / `WorkspacesController` もこの方式へ移行(コントローラから手動の所属チェック・ロールチェック・`if` バリデーションが消えた)
- **Service 層への統一**: 全コントローラから `prisma.*` 直書きを排除し、`ProjectsService` / `DocumentsService` / `MembershipService` / `BillingService` 経由に。永続化と `tenantId` の差し込みは Service 層に集約(path slug 経路は ALS 非依存なので `tenantId` を明示注入)。`CLAUDE.md` に「### レイヤリング(コントローラ / サービス)」節を追記
- ローカル E2E 確認(認証付き、19 項目):Project の 作成 → 一覧 → 取得 → 更新 → ドキュメント一覧/本文取得 → 削除 → 削除後 404 / バリデーション 400(name 欠落・未知フィールド・不正 enum・不正 query・generate の docType・checkout の plan)/ 認証なし 401 を一括スクリプトで確認

### 主要 deliverable のサマリー

| 文書            | 役割               | 副業面談での使い方                   |
| --------------- | ------------------ | ------------------------------------ |
| ADR 5 本        | 設計判断の言語化   | 「なぜこの選択をしたか」を即答できる |
| data-model.md   | DB 設計の真実の源  | マルチテナント実装の証拠             |
| architecture.md | システム構成の俯瞰 | AWS/インフラ知識のアピール           |
| screen-flow.md  | ユーザー体験設計   | プロダクト思考の証明                 |

---

## 6. ロードマップ

### Week 1: 設計と基盤(Day 1〜7)

| Day   | テーマ                              | 状態    | 主要 deliverable                                                                                                                                                                                                                   |
| ----- | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Day 1 | ADR 記述                            | ✅ 完了 | ADR 5 本                                                                                                                                                                                                                           |
| Day 2 | ER・C4・画面遷移                    | ✅ 完了 | データモデル、アーキテクチャ、画面遷移図                                                                                                                                                                                           |
| Day 3 | 開発環境セットアップ                | ✅ 完了 | Turborepo monorepo、Docker(PostgreSQL+pgvector)、ESLint/Prettier、GitHub Actions CI、ADR-006(モノレポ構成)                                                                                                                         |
| Day 4 | フロントエンド基盤(Next.js + 認証)  | ✅ 完了 | Next.js 15 + React 19 + Tailwind v4 + shadcn/ui + Clerk 統合、`/w/{slug}` ルーティング雛形、Vercel デプロイ、master→main rename                                                                                                    |
| Day 5 | マルチテナント基盤(NestJS + Prisma) | ✅ 完了 | NestJS 雛形、Prisma schema + マイグレーション、Client Extension(tenantId 自動注入)、TenantMiddleware、Clerk JWT Guard、`/workspaces/:slug` + `/w/[slug]` 所属チェック                                                              |
| Day 6 | Stripe 基盤                         | ✅ 完了 | Stripe SDK 統合、テスト用 Product/Price、`POST /webhooks/stripe`(署名検証 + Idempotency)、`BillingService` で 5 イベント → `Subscription`/`Tenant.plan` 同期、`POST /workspaces/:slug/checkout-session`、stripe-cli で E2E 確認    |
| Day 7 | AI 基盤 + 最初の AI 機能            | ✅ 完了 | Anthropic SDK 統合、`AIUsageService`(記録 + Free 月 20 回上限)、`POST .../documents/generate`(Sonnet 4 + Tool Use で README/LP 生成)、ADR-007(メール基盤)、所属チェック共通化 / dayjs / 定数集約。embedding 挿入のみ Week 2 へ繰越 |

### Week 2 進捗

- ✅ **Day 8**: Project の CRUD API(`ProjectsController` / `ProjectsService` / DTO)+ ProjectDocument の閲覧 API(`DocumentsController` / `DocumentsService`)+ リクエストバリデーション(`class-validator` / グローバル `ValidationPipe`、全入力 DTO 化)+ RBAC ガード化(`@Roles` / `WorkspaceGuard` / `@CurrentWorkspace()` を `apps/api/src/auth/` に集約)+ Service 層統一(コントローラから `prisma.*` 直書きを排除)

### 次にやること(Day 9〜)

- **embedding 挿入(Day 7 から繰越)**: OpenAI `text-embedding-3-small`(1536 次元、HNSW)で `ProjectDocument.embedding` を埋める。`OPENAI_API_KEY` 用意 + `EmbeddingService` + `$executeRaw` での `embedding = $1::vector`(ESLint `no-raw-sql-without-tenant-filter` を満たすため `tenantId` フィルタ必須)
- ChecklistItem の CRUD(`apps/api`)、ProjectDocument の編集・削除・推敲(version インクリメント)
- AI 機能の本実装(競合調査・タスク分解・チェックリスト生成・推敲)
- RAG(過去 `ProjectDocument` のベクトル検索 → 生成時に context 注入、ADR-005 の独自性コア。コールドスタート対策は §9.3)
- 注: AI 呼び出しは必ず `AIUsageService.record` する(課金・上限判定の根拠なので取りこぼし禁止)

### Week 2: コア機能実装(Day 8〜14)

- 学習ログ CRUD(プロジェクト・チェックリスト・ProjectDocument)
- AI 機能の本実装
  - 競合調査(Web Search Tool 併用)
  - ドキュメント自動生成(README/LP/告知文)
  - タスク分解(Tool Use)
  - リリース前チェックリスト生成
- RAG 実装(過去ドキュメントのベクトル化と検索)
- 検索・フィルタリング UI

### Week 3: 課金・本番化(Day 15〜21)

- Stripe Checkout 実装
- Webhook 5 イベント処理(checkout.completed、subscription.updated/deleted、invoice.paid/failed)
- Subscription Quantity による Team プラン人数課金
- AWS 本番デプロイ(ECS Fargate + Aurora + ElastiCache)
- ランディングページ作成
- README + Zenn 記事化(設計判断の言語化)
- **公開リリース**

### Week 4 以降: 成長フェーズ(本業開始後・週 12 時間)

- ユーザーフィードバック対応
- GitHub 連携(コミット情報自動取り込み)
- VS Code 拡張(エディタから直接保存)
- 月次レポート AI 生成
- Twitter/Zenn での告知活動
- クラウドワークスでの実案件獲得と並行

---

## 7. 重要な周辺戦略

### 副業活動のステップ

1. **Phase 1(今〜3 ヶ月)**: クラウドワークスで実績作り(★5 評価を 10 件目標)
2. **Phase 2(3〜6 ヶ月)**: ココナラ・MENTA・直契約に拡張
3. **Phase 3(半年〜1 年)**: フリーランスエージェント(レバテック・Findy)登録
   - 週 12 時間制約があるため、ITプロパートナーズ等の「週 1 日〜OK」案件が中心になる

### Shipyard の役割

- Phase 1〜3 全体で「個人開発 SaaS 運営者」のプロフィール強化材料
- リリース後の Zenn 記事・GitHub 公開で技術力の可視化
- 面談時の「マルチテナント + Stripe + AI 経験」の証拠

### AWS CLF 資格(並行学習)

- 朝/夜 30 分の固定枠で学習
- Week 3 末に受験予定
- Shipyard 開発で AWS 実務経験ができるので、資格と実務がセットで効く

---

## 8. 重要なメモ・ノウハウ

### マルチテナントの本質的な理解

- 「マルチユーザー(Twitter 型)」と「マルチテナント(Slack 型)」は別概念
- マルチテナント = 組織という概念があって、組織内のメンバーはデータ共有、組織間は完全分離
- B2B SaaS 案件の主戦場 = マルチテナント設計経験必須

### 案件市場で評価される要素(調査結果)

- フロント/バック分離・Docker・CI/CD は「できて当たり前」、差別化にならない
- 設計判断の言語化(ADR 等)が真の差別化要素
- AI 生成コードを動くだけにしているとバレる、設計判断を語れることが重要

### 既存サービスとの戦い方

- レッドオーシャン領域(ナレッジ管理・タスク管理・カレンダー・メモ)は避ける
- Shipyard は「個人開発リリース支援」というニッチを掘る
- 大手プロダクトの劣化版にならない、独自性(過去プロジェクト RAG)を活かす

---

## 9. 未決定事項・フォローアップ

このセクションは「ADR には書ききれていないが、今後の判断・実装で意識する必要がある事項」を集約する。Day 3 着手前の整理として 2026-05-01 に追記。

### 9.1 ADR-003 への追記候補: URL `/w/{slug}` の `w` を採用した理由

- 現状の ADR-003 は「サブパス方式を採用」までは書かれているが、なぜ `workspaces` ではなく `w` 1 文字なのかの理由は未記載
- 採用根拠(後付けで言語化):
  - ターゲットが開発者で、Vercel / Linear / GitHub の慣習(短い URL)に近い方が違和感が少ない
  - URL 共有時(Tweet・Slack・口頭)の摩擦を最小化
  - `/orgs/{slug}` `/teams/{slug}` のような並列パスを将来追加する余地が広い
  - `w` の意味は登録済みユーザーには 2 回見れば学習できる
- 対応: ADR-003 の「理由」セクションに 1 段落追記する(Day 3 着手前 or 同時)

### 9.2 メール送信基盤の選定 → ADR-007 で確定(Day 7)

- 当初「ADR-006 候補」としていたが、ADR-006 はモノレポ構成で使用済みのため **ADR-007**(`docs/adr/007-mail-provider.md`)として起票
- 決定: **MVP は Resend を採用**(SES の Sandbox 解除申請が MVP のブロッカーになるリスク回避、無料枠 3,000 通/月で招待メールが即日動作)。本番で送信量が閾値を超えたら AWS SES への移行を検討
- 実装メモ(フォローアップ): `apps/api/src/mail/` に薄い `MailService` 抽象を置き、プロバイダ差し替え可能にする。配送性のため SPF / DKIM / DMARC の DNS 設定が必要

### 9.3 RAG コールドスタート対策(Week 2 実装時の課題)

- ADR-005 で RAG を独自性のコアと位置付けたが、初回利用者は過去 `ProjectDocument` が 0 件 → RAG が空振りするコールドスタート問題がある
- そのまま実装すると、新規ユーザーが「ただの Sonnet 4 生成」しか体験できず差別化が伝わらない
- 対策案(Week 2 で設計に組み込む):
  - オンボーディングで「サンプル README / LP テンプレート」を seed として `ProjectDocument` に投入し、初回から RAG を動かす
  - 過去に書いた README を URL or zip でインポートする機能(Day 8 以降の追加機能候補)
  - デモ動画では「3 プロジェクト目を生成する」シナリオで効果を見せる
- ランディングページのメッセージング設計にも反映する(「使い込むほど自分らしくなる」)

---

## 10. 別 Claude セッションで再開する場合の指示

### 開始時の伝え方

このドキュメントを貼り付けて、以下のように伝える:

> Shipyard プロジェクトの続きをやりたい。このドキュメントが現在の状況。
> 次は [Day X] の作業に入りたい。

### Claude に守ってもらうこと

- ですます調で応答する
- 簡潔な出力を維持する
- 副業面談での評価軸を常に意識する
- 既に決まった ADR の内容を覆さない(変更時は明示的に新 ADR を起こす)

### 過去の議論で重要だったポイント

- マルチテナントの説明は「マルチユーザーとの違い」から入ると伝わりやすい
- abcw は前職予実管理ドメイン(SKY 案件)の経験あり、それは案件管理で活かせるが、競業避止上「予実管理」の題材は NG
- 副業マーケット調査結果(2026 年時点で TypeScript + Next.js が 8 割超)は前提として共有済み
- 案 M+(エンジニア向け学習ログ)は Reor / Mem.ai / Notion AI と直接競合のため棄却済み
- 案 AA(Shipyard)は「abcw 自身がこれから個人開発する」当事者性が決め手

---

## 11. 変更履歴

| 日付       | 変更内容                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-01 | 初版作成。Day 1〜2 完了時点の状態を記録。                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-05-01 | ターゲットを個人開発者 + 小規模チーム(2〜10 人)に拡張。セクション 1 のワンライナー / ターゲット / 提供価値を更新。                                                                                                                                                                                                                                                                                             |
| 2026-05-01 | セクション 9「未決定事項・フォローアップ」を追加(`/w` 採用理由、メール基盤 ADR-006 候補、RAG コールドスタート対策)。以降の節を繰り上げ。                                                                                                                                                                                                                                                                       |
| 2026-05-01 | コミュニケーション規約を「だ・である調」から「ですます調」に変更(`CLAUDE.md` も同期)。                                                                                                                                                                                                                                                                                                                         |
| 2026-05-08 | Day 3 完了(Turborepo monorepo / Docker / ESLint / Prettier / GitHub Actions CI / ADR-006)。                                                                                                                                                                                                                                                                                                                    |
| 2026-05-08 | Day 4 完了(Next.js 15 + React 19 + Tailwind v4 + shadcn/ui + Clerk 統合 + `/w/{slug}` ルーティング雛形 + Vercel Production/Preview デプロイ)。                                                                                                                                                                                                                                                                 |
| 2026-05-08 | 既定ブランチを `master` から `main` に rename(GitHub / CI / Vercel / docs すべて整合)。                                                                                                                                                                                                                                                                                                                        |
| 2026-05-08 | CLAUDE.md の「実装時に外せない制約」に「フロントエンド」節を追加(`<body>` への動的属性禁止 / suppressHydrationWarning の運用ルール)。                                                                                                                                                                                                                                                                          |
| 2026-05-11 | Day 5 完了(NestJS 11 + Prisma 6 雛形 / 全モデルの schema + マイグレーション / pgvector + HNSW / Prisma Client Extension で tenantId 自動注入 / TenantMiddleware / ESLint カスタムルール / Clerk JWT Guard / `GET /workspaces/:slug` / `/w/[slug]` 所属チェック)。Week 1 残りは Day 6・7。                                                                                                                      |
| 2026-05-11 | CI 修正: `pnpm/action-setup` v4 と `packageManager` の二重バージョン指定エラーを解消(ワークフローの `version: 10` を削除)。                                                                                                                                                                                                                                                                                    |
| 2026-05-11 | 学習ノート vault に `データベース/Prisma.md` と `バックエンド/NestJS.md` を作成。                                                                                                                                                                                                                                                                                                                              |
| 2026-05-12 | Day 6 完了(Stripe SDK v22 統合 / テスト用 Product・Price / `POST /webhooks/stripe` 署名検証 + Idempotency(`WebhookEvent`)/ `BillingService` で 5 イベント → `Subscription`・`Tenant.plan` 同期 / `POST /workspaces/:slug/checkout-session`(OWNER のみ)/ stripe-cli で E2E 確認)。Week 1 残りは Day 7。                                                                                                         |
| 2026-05-12 | Day 7 完了(Anthropic SDK 統合 / `AIUsageService`(記録 + Free 月 20 回上限)/ `POST .../documents/generate`(Sonnet 4 + Tool Use で README・LP 生成)→ `ProjectDocument` 保存 + `AIUsage` 記録、実 Claude API で E2E 確認)。embedding 挿入のみ Week 2 へ繰越。Week 1 完了。                                                                                                                                        |
| 2026-05-12 | ADR-007(メール送信基盤)を起票 — Resend を MVP 採用(§9.2 の宿題消化)。所属チェックを `MembershipService` に共通化、schema enum を `@shipyard/db` 経由参照に統一、日付処理を `dayjs` に統一、AI 設定値を `ai.constants.ts` に集約。CLAUDE.md に「日付・時刻の扱い」「マジックナンバー/設定値」ルールを追記。                                                                                                     |
| 2026-05-13 | Day 8 完了(Project の CRUD API + ProjectDocument の閲覧 API、`class-validator` + グローバル `ValidationPipe`(全入力 DTO 化)、RBAC ガード化(`@Roles` / `WorkspaceGuard` / `@CurrentWorkspace()` を `apps/api/src/auth/` に集約)、Service 層統一(コントローラから `prisma.*` 直書きを排除)、`CLAUDE.md` に「レイヤリング」節を追記)。実 API で CRUD・バリデーション・404/401 を E2E 確認(19 項目)。Week 2 着手。 |

---

## 補足: 参照ドキュメント一覧

```
docs/
├── adr/
│   ├── 000-template.md             # ADR テンプレート
│   ├── 001-tech-stack.md           # 技術スタック
│   ├── 002-multitenancy.md         # マルチテナント方式
│   ├── 003-tenant-resolution.md    # テナント解決
│   ├── 004-billing-plans.md        # 課金プラン
│   ├── 005-ai-responsibility.md    # AI 戦略
│   ├── 006-monorepo-structure.md   # モノレポ構成(apps/ vs packages/、packages/db の位置)
│   └── 007-mail-provider.md        # メール送信基盤(Resend を MVP 採用、SES 移行検討)
├── OVERVIEW.md                      # プロダクト概要(まずこれを読めば全体像が掴める)
├── PROJECT_STATUS.md                # 本ファイル(SSoT)
├── data-model.md                    # ER + Prisma スキーマ + インデックス戦略
├── architecture.md                  # C4 + AWS デプロイ構成
├── screen-flow.md                   # 6 つの主要ユーザーフロー
├── data-model-erd.generated.md      # schema.prisma から自動生成(Mermaid ER 図、prisma generate で更新)
└── setup-vercel.md                  # Vercel セットアップ手順
```

`PROJECT_STATUS.md`(本ファイル)が常に最新。他のドキュメントとの不整合があれば本ファイルを優先する。
