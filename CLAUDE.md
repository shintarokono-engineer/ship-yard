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

| 場面 | skill / agent |
|---|---|
| チケット受領直後 | `/understanding-ticket` skill |
| 着手前のコード調査 | `/exploring-related-code` skill |
| 実装計画 | `/planning-implementation` skill, `planner` agent |
| 実装 | `/loop` ビルトイン or 手動 |
| コミット直前 | `/checking-commit` skill |
| PR 直前のセルフレビュー | `/reviewing-own-changes` skill |
| PR 説明書き | `/writing-pr-description` skill |
| レビューコメント対応 | `/responding-to-review` skill |
| エラー/障害調査 | `/investigating-error` skill |
| 落ちたテストの調査 | `/debugging-failing-test` skill |
| リリースノート作成 | `/writing-release-notes` skill |
| React 健全性監査 | `/running-react-doctor` skill |
| 依存パッケージ追加検討 | `/reviewing-dependency` skill |
| env 変数のドキュメント化 | `/documenting-env-vars` skill |
| 仕様書/RFC/decision doc 共同執筆 | `/doc-coauthoring` skill (公式) |
| UI 作成 | `/frontend-design` skill (公式) |
| UI テスト | `/webapp-testing` skill (公式) |
| 新 skill の作成 | `/skill-creator` skill (公式) |
| レビュー(汎用) | `/review` ビルトイン or `code-reviewer` agent |
| セキュリティレビュー | `/security-review` ビルトイン or `security-reviewer` agent |
| React 特化レビュー | `react-reviewer` agent |
| テスト作成 | `test-writer` agent |
| バグ修正 | `debugger` agent |
| リファクタ | `refactorer` agent |
| ドキュメント作成 | `docs-writer` agent |

skill の出力は `.claude/output/<skill-name>/` に保存される(git 管轄外)。
