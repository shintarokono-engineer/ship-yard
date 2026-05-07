# Shipyard

個人開発者および小規模開発チーム(2〜10 人)向けの、「アイデア → 設計 → 開発 → リリース → 初期ユーザー獲得」までを一元管理する AI 支援付き B2B SaaS です。

> **現在のステータス**: 設計フェーズ完了(Week 1 / Day 2)、Day 3 で実装環境構築に着手中。コードはまだ存在しません。

## 主要機能

- **マルチプロジェクト管理**: 複数の個人開発プロジェクトを並列で管理
- **AI 支援**: 競合調査・README / LP / 告知文の自動ドラフト・タスク分解・チェックリスト生成(Anthropic Claude)
- **過去資産の RAG**: 過去のプロジェクトドキュメントをベクトル検索して、新規生成時にコンテキストとして注入(独自性)
- **リリース前チェックリスト**: 技術 / 法務 / マーケ / UX / その他の 5 カテゴリで自動生成
- **チーム機能**(Team プラン): メンバー招待・6 種ロール(OWNER / ADMIN / DEVELOPER / REVIEWER / TESTER / VIEWER)・共同編集・レビュー・監査ログ

## 技術スタック

| 領域                | 採用                                                        |
| ------------------- | ----------------------------------------------------------- |
| フロントエンド      | Next.js (App Router) + TypeScript + Tailwind CSS            |
| バックエンド        | NestJS + Prisma                                             |
| データベース        | PostgreSQL 16 + pgvector                                    |
| 認証                | Clerk                                                       |
| 決済                | Stripe Subscriptions                                        |
| AI                  | Anthropic API(Claude Sonnet 4 + Haiku 4.5)                  |
| キュー / キャッシュ | Redis(ElastiCache)+ BullMQ                                  |
| ストレージ          | AWS S3                                                      |
| インフラ            | Vercel(Web)+ AWS ECS Fargate(API)+ RDS Aurora Serverless v2 |
| Monorepo            | Turborepo + pnpm                                            |

詳細は [docs/adr/001-tech-stack.md](./docs/adr/001-tech-stack.md) を参照してください。

## セットアップ(Day 3 完了後に動作します)

> 以下の手順は Day 3 の開発環境構築完了後に有効になります。現時点ではコードがないため動作しません。

```bash
# 1. リポジトリをクローン
git clone https://github.com/<owner>/shipyard.git
cd shipyard

# 2. 依存関係をインストール(pnpm 必須)
pnpm install

# 3. 環境変数を設定
cp .env.example .env.local
# .env.local を編集し、Clerk / Stripe / Anthropic の各 API キーを設定

# 4. ローカル DB の起動(PostgreSQL 16 + pgvector + Redis)
docker compose up -d

# 5. データベースマイグレーション + Seed
pnpm db:migrate
pnpm db:seed

# 6. 開発サーバー起動
pnpm dev
```

`pnpm install` から `pnpm dev` まで 5 分以内で `http://localhost:3000` にアクセス可能になることを目標とします。

## ドキュメント

| ファイル                                           | 内容                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| [docs/OVERVIEW.md](./docs/OVERVIEW.md)             | プロダクト概要(まずこれを読めば全体像が掴める)                         |
| [docs/PROJECT_STATUS.md](./docs/PROJECT_STATUS.md) | プロジェクト全体の状況・決定事項・ロードマップ(Single Source of Truth) |
| [docs/GOALS.md](./docs/GOALS.md)                   | 目標体系                                                               |
| [docs/adr/](./docs/adr/)                           | Architecture Decision Records(設計判断の言語化、5 本)                  |
| [docs/data-model.md](./docs/data-model.md)         | ER 図 + Prisma スキーマ + インデックス戦略                             |
| [docs/architecture.md](./docs/architecture.md)     | C4 Context / Container + AWS デプロイ構成                              |
| [docs/screen-flow.md](./docs/screen-flow.md)       | 6 つの主要ユーザーフロー(オンボーディング・招待・課金 等)              |
| [docs/api.md](./docs/api.md)                       | API 仕様(OpenAPI 自動生成)                                             |
| [docs/deployment.md](./docs/deployment.md)         | デプロイ手順                                                           |

## ライセンス

[MIT License](./LICENSE)
