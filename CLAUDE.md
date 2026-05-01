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

- 日本語、**だ・である調**(no honorifics)で簡潔に出力する
- 過剰な要約・冗長な説明は避ける
- ドキュメントの更新時も同じトーンで書く
