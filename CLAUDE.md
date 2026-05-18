# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Shipyard は個人開発者および**小規模開発チーム(2〜10 人)**向けの B2B SaaS(マルチテナント + Stripe + AI 支援)。ユーザーは個人開発者だけでなく、共同で個人発プロジェクト・ハッカソン作品・スタートアップ初期プロダクトを進めるチームも対象。データモデルは `TenantMember`(`OWNER` / `ADMIN` / `DEVELOPER` / `REVIEWER` / `TESTER` / `VIEWER` の 6 種ロール)と `InvitationToken` でチーム機能を支える設計。Team プラン(¥2,800/人)は共同編集・レビュー・監査ログを提供する。

詳細なターゲット定義・提供価値は `docs/PROJECT_STATUS.md` セクション 1 を参照(SSoT)。

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

横断的な設計制約は **`docs/implementation-rules.md`** に集約。**`apps/api/src/**` / `apps/web/src/**` / `packages/db/**` を編集する前に必ず Read** すること(常時 context に入る量を抑えるためファイル分離している)。

主な節(詳細はリンク先):

- マルチテナント(Pool model + tenantId 自動注入、raw SQL は `WHERE tenantId =` 必須)
- レイヤリング(controller は Service 経由のみ、`prisma.*` 直書き禁止)
- テナント解決(`/w/{slug}` サブパス、`X-Tenant-Slug` ヘッダ伝搬、未所属は 404)
- 課金(Stripe Webhook の Idempotency、Team プランは Subscription Quantity)
- AI(Sonnet 4 / Haiku 4.5 使い分け、AIUsage 記録必須、RAG は pgvector + text-embedding-3-small)
- フロントエンド(`<body>` への動的属性禁止、suppressHydrationWarning との関係)
- 日付・時刻(`dayjs` 統一、`apps/api/src/common/time.ts` から import)
- マジックナンバー(定数ファイルに集約、enum はマジック文字列を使わない)

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
| 動作確認観点の出力               | `/test-design` skill                                       |
| API E2E 実行                     | `/run-e2e` skill                                           |
| 新 skill の作成                  | `/skill-creator` skill (公式)                              |
| レビュー(汎用)                   | `/review` ビルトイン or `code-reviewer` agent              |
| セキュリティレビュー             | `/security-review` ビルトイン or `security-reviewer` agent |
| React 特化レビュー               | `react-reviewer` agent                                     |
| テスト作成                       | `test-writer` agent                                        |
| バグ修正                         | `debugger` agent                                           |
| リファクタ                       | `refactorer` agent                                         |
| ドキュメント作成                 | `docs-writer` agent                                        |

skill の出力は `.claude/output/<skill-name>/` に保存される(git 管轄外)。
