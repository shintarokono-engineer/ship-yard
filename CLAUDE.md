# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Shipyard は個人開発者および**小規模開発チーム(2〜10 人)**向けの B2B SaaS(マルチテナント + Stripe + AI 支援)。ユーザーは個人開発者だけでなく、共同で個人発プロジェクト・ハッカソン作品・スタートアップ初期プロダクトを進めるチームも対象。データモデルは `TenantMember`(`OWNER` / `ADMIN` / `DEVELOPER` / `REVIEWER` / `TESTER` / `VIEWER` の 6 種ロール)と `InvitationToken` でチーム機能を支える設計。Team プラン(¥2,800/人)は共同編集・レビュー・監査ログを提供する。

詳細なターゲット定義・提供価値は `docs/PROJECT_STATUS.md` セクション 1 を参照(SSoT)。

## このリポジトリの現状

**現時点でコード実装はゼロ**で、`docs/` 配下の設計ドキュメントのみが存在する。Week 1 / Day 2 完了、Day 3 で Turborepo monorepo を作成する直前の状態。

ビルド・テスト・lint 等のコマンドはまだ存在しない。Day 3 以降、`apps/web`(Next.js)、`apps/api`(NestJS)、`packages/db`(Prisma)、`packages/ui`、`packages/types` の構成で立ち上がる予定。

## Single Source of Truth

`docs/PROJECT_STATUS.md` がプロジェクト全体の現状・決定事項・次のアクションをまとめた単一の真実の源。**他のドキュメントと不整合があれば PROJECT_STATUS.md を優先する**。重要な決定が出たら即時に追記し、ファイル冒頭の「最終更新」日付も更新する。

## ドキュメント構成と読む順番

1. `docs/PROJECT_STATUS.md` — 現状・ロードマップ・次にやること
2. `docs/adr/001-005` — 確定した設計判断(技術スタック / マルチテナント / テナント解決 / 課金 / AI)
3. `docs/data-model.md` — Prisma スキーマ全文 + インデックス戦略
4. `docs/architecture.md` — C4 Context/Container + AWS デプロイ構成
5. `docs/screen-flow.md` — 6 つの主要フロー(オンボーディング、プロジェクト作成、招待、課金、AI 生成、ワークスペース切替)

ADR は `承認済み` なので**勝手に覆さない**。方針転換が必要な場合は新しい ADR(`docs/adr/006-...md`)を `docs/adr/000-template.md` に従って起こす。

## 実装時に外せない制約

これらは横断的に効く設計制約で、実装を始める前に必ず把握すること。

### マルチテナント(ADR-002)

- **Pool model**: 全テナント共有 DB、業務テーブルは全て `tenantId` カラムを持つ
- 例外: `User` と `WebhookEvent` はテナントを持たない
- Service 層から `tenantId` を意識せず書けるよう、Prisma Client Extension で自動注入(Day 5 で実装)
- AsyncLocalStorage でリクエストコンテキストを伝搬
- **Raw SQL は原則禁止**。やむを得ず使う場合は `WHERE tenantId = $1` を明示し、ESLint カスタムルール `no-raw-sql-without-tenant-filter` で検出する

### レイヤリング(コントローラ / サービス)

- **コントローラは Prisma を直接呼ばない**。各アグリゲート(Project / ProjectDocument / …)に Service を置き、永続化(`prisma.*`)と `tenantId` の差し込みは Service 層に集約する。コントローラの責務は「認証・所属/権限の確認(`WorkspaceGuard` + `@Roles`)・入出力の整形・Service 呼び出し」まで
- 認証・所属解決・ロール検証は `@UseGuards(ClerkAuthGuard, WorkspaceGuard)` + ハンドラの `@Roles(...)` で宣言的に行い、解決済みの所属情報は `@CurrentWorkspace()` パラメータデコレータで受け取る(`workspaces/:slug/...` ルートの場合)
- path slug ベースのルート(`workspaces/:slug/...`)は ALS のテナントコンテキストを持たないので、Service は引数で受け取った `tenantId` を全クエリの `where`/`data` に明示注入する(自動注入の Client Extension は ALS がある場合のみ効く)

### テナント解決(ADR-003)

- URL は **サブパス方式** `shipyard.app/w/{slug}` に統一(サブドメインではない)
- Next.js middleware で slug を抽出し、API には `X-Tenant-Slug` ヘッダーで伝搬
- 所属していない slug にアクセスした場合は 404(存在の有無を漏らさない)

### 課金(ADR-004)

- Stripe Webhook の Idempotency Key は `event.id`(`WebhookEvent.stripeEventId` ユニーク制約で担保)
- Team プランの人数は Subscription Quantity で表現、メンバー追加時に即時更新
- 解約後は 7 日 grace → 30 日凍結 → 削除

### AI(ADR-005)

- Sonnet 4: 競合調査 / ドキュメント生成 / RAG QA(品質要件が高い場面)
- Haiku 4.5: タスク分解 / チェックリスト生成 / 文章推敲(構造化中心)
- Tool Use は構造化出力が必要な場面のみ。利用箇所はコードコメントで理由を残す
- pgvector + text-embedding-3-small(1536 次元)、HNSW インデックスで RAG
- 全 AI 呼び出しは `AIUsage` テーブルにテナント単位で記録(Free プラン月 20 回上限の判定にも使う)

### フロントエンド(Next.js App Router / React)

- **`<body>` には固定属性のみ置く**(固定 `className` は OK。theme 切替・動的 class・状態フラグ等の動的属性を `<body>` に付けない)
  - 理由: ブラウザ拡張(ColorZilla / Grammarly 等)が `<body>` に属性を注入することによる hydration mismatch を、`apps/web/src/app/layout.tsx` で `suppressHydrationWarning` を付けて抑制している。この prop は **1 階層分のあらゆる属性差分を全て無視する** ため、`<body>` 経由で動的状態を扱うと本物のバグも黙殺される
  - 動的な状態(theme / lang 切替 / 装飾 class 等)は **`<html>`** か中の Client Component で扱う
  - 例外: `next-themes` 等で `<html>` に状態を付ける場合は `<html>` 側にも `suppressHydrationWarning` を付ける(`<body>` 同様の理由)

### 日付・時刻の扱い

- **日付・時刻の生成・パース・計算・タイムゾーン処理は `dayjs` を使う**(`new Date(...)` での日付演算・UTC 操作・Unix 秒変換は避ける)
  - `apps/api/src/common/time.ts` で UTC プラグインを extend 済みの `dayjs` を re-export しているので、API 側はそこから import する(例: 月初は `dayjs.utc().startOf('month').toDate()`、Unix 秒は `dayjs.unix(sec).toDate()`)
  - 例外: 「現在時刻のスナップショット」程度の `new Date()`(`createdAt` のデフォルトや `processedAt` 等)は許容

### マジックナンバー / 設定値

- 上限回数・モデル ID・単価・為替・タイムアウト等、**変更されうる値は定数ファイルに集約**する(コード中に直書きしない)。例: AI 関連は `apps/api/src/ai/ai.constants.ts`
- schema の enum がある値はマジック文字列ではなく enum(`@shipyard/db` 経由)を使う(`'PRO'` ではなく `Plan.PRO`)

## コミュニケーション規約

- 日本語、**ですます調**で簡潔に出力する
- 過剰な要約・冗長な説明は避ける
- ドキュメントの更新時も同じトーンで書く

## コミット規約

- ファイル変更後、コミット前に必ず以下を行う:
  1. **実装した内容の概要を表示する**(変更ファイル一覧 + 変更内容の要約)
  2. **「コミットしていいですか?」と確認する**
- 確認なしで自動コミットしない
- コミットメッセージは原則日本語で記述する(`docs:` `chore:` `feat:` 等の Conventional Commits プレフィックスは継続使用)
- ユーザーが具体的な英語のコミットメッセージを指定した場合はそれに従う
- **コミットメッセージに Claude の痕跡を残さない**(`Co-Authored-By: Claude ...` 等の自動付与行は付けない、メッセージ本文にも `🤖 Generated with Claude Code` 等の文言を入れない)

## 設定ファイル作成のタイミング

- `.env.example` / `docker-compose.yml` / `package.json` 等の**実コードに紐付く設定ファイル**は、それを読み取るパッケージや実装が存在するタイミングで作成する
- 設計フェーズで「将来必要になりそう」だけを根拠に作成しない(項目の過不足や齟齬の原因になる)
- 例: `.env.example` は Day 3 で Next.js / NestJS / Prisma を導入し、実際にどの環境変数が読まれるかが確定してから作成する

## Claude Code セットアップ

このリポジトリは [`shintarokono-engineer/claude-template`](https://github.com/shintarokono-engineer/claude-template) から派生した `.claude/` 設定を含む。利用可能な subagent / skill は `.claude/agents/` と `.claude/skills/` 配下を参照。

### 開発ループ別の主な skill

| 場面                             | skill / agent                                              |
| -------------------------------- | ---------------------------------------------------------- |
| チケット受領直後                 | `/understanding-ticket` skill                              |
| 着手前のコード調査               | `/exploring-related-code` skill                            |
| 実装計画                         | `/planning-implementation` skill, `planner` agent          |
| 実装                             | `/loop` ビルトイン or 手動                                 |
| コミット直前                     | `/checking-commit` skill                                   |
| PR 直前のセルフレビュー          | `/reviewing-own-changes` skill                             |
| PR 説明書き                      | `/writing-pr-description` skill                            |
| レビューコメント対応             | `/responding-to-review` skill                              |
| エラー/障害調査                  | `/investigating-error` skill                               |
| 落ちたテストの調査               | `/debugging-failing-test` skill                            |
| リリースノート作成               | `/writing-release-notes` skill                             |
| React 健全性監査                 | `/running-react-doctor` skill                              |
| 依存パッケージ追加検討           | `/reviewing-dependency` skill                              |
| env 変数のドキュメント化         | `/documenting-env-vars` skill                              |
| 仕様書/RFC/decision doc 共同執筆 | `/doc-coauthoring` skill (公式)                            |
| UI 作成                          | `/frontend-design` skill (公式)                            |
| UI テスト                        | `/webapp-testing` skill (公式)                             |
| 新 skill の作成                  | `/skill-creator` skill (公式)                              |
| レビュー(汎用)                   | `/review` ビルトイン or `code-reviewer` agent              |
| セキュリティレビュー             | `/security-review` ビルトイン or `security-reviewer` agent |
| React 特化レビュー               | `react-reviewer` agent                                     |
| テスト作成                       | `test-writer` agent                                        |
| バグ修正                         | `debugger` agent                                           |
| リファクタ                       | `refactorer` agent                                         |
| ドキュメント作成                 | `docs-writer` agent                                        |

skill の出力は `.claude/output/<skill-name>/` に保存される(git 管轄外)。
