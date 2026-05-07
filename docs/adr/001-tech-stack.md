# ADR-001: 技術スタックの選定

## ステータス

承認済み(2026-05-01)

## 背景・問題

Shipyard は個人開発エンジニア向けの「アイデアからリリースまで」を一気通貫で支援するB2B SaaS。3週間でMVPを完成させ、その後継続成長させる必要がある。技術スタックを早期に確定し、Day 3以降の実装を迷いなく進められる土台を固める。

副業面談での技術力アピールも兼ねるため、市場で需要が高く、設計判断を語れる技術を選定する。

## 検討した選択肢

### フロントエンド

- A. **Next.js (App Router) + TypeScript + Tailwind CSS**
- B. Remix + TypeScript + Tailwind CSS
- C. Astro + Solid.js

### UI コンポーネント

- A. **Tailwind CSS + shadcn/ui**(Radix UI ベースのコピペ式)
- B. Material UI(MUI v6)
- C. Chakra UI v3
- D. Mantine v7
- E. Tailwind CSS のみ(コンポーネントは自作)

### バックエンド

- A. **NestJS + Prisma**
- B. Node.js + Hono + Drizzle
- C. Go + Echo + sqlc

### データベース

- A. **PostgreSQL 16 + pgvector**
- B. PostgreSQL + Pinecone(マネージドベクトルDB)
- C. PostgreSQL + Qdrant

### 認証

- A. **Clerk**
- B. Auth.js(NextAuth)
- C. Supabase Auth
- D. 自前実装(Passport.js + JWT)

### 決済

- A. **Stripe Subscriptions**
- B. Lemon Squeezy
- C. Paddle

### インフラ

- A. **Vercel + AWS ECS Fargate + RDS Aurora Serverless v2**
- B. Vercel + Render + Supabase
- C. AWS Amplify + ECS + RDS

### AI

- A. **Anthropic API(Claude Sonnet 4 + Haiku 4.5)**
- B. OpenAI API(GPT-4)
- C. ローカルOSS(Ollama)

### キュー / バックグラウンド処理

- A. **Redis + BullMQ**
- B. AWS SQS + Lambda
- C. RabbitMQ + amqplib
- D. AWS Step Functions

### Monorepo ツール

- A. **Turborepo + pnpm Workspaces**
- B. Nx
- C. Lerna(現在はメンテモード)
- D. Rush
- E. Polyrepo(モノレポを採用しない)

## 決定

- **フロント**: Next.js (App Router) + TypeScript + Tailwind CSS
- **バック**: NestJS + Prisma
- **DB**: PostgreSQL 16 + pgvector
- **認証**: Clerk
- **決済**: Stripe Subscriptions
- **インフラ**: Vercel(フロント)+ AWS ECS Fargate(API)+ RDS Aurora Serverless v2
- **AI**: Anthropic API
- **UI コンポーネント**: Tailwind CSS + shadcn/ui
- **キュー / バックグラウンド**: Redis(ElastiCache)+ BullMQ
- **Monorepo**: Turborepo + pnpm Workspaces

## 理由

### Next.js (App Router)

- 副業案件市場の8割超でデファクトスタンダード(2026年時点)
- Server Components で初期ロード最適化、SEO 対応
- Vercel デプロイで自動 CI/CD 構築可能
- 自分の現職スタック(SKY 案件)と一致 → 学習コストゼロで実装に集中可能

### NestJS + Prisma

- 現職経験あり、即戦力で進められる
- DI コンテナ・モジュール設計が GraphQL/REST 両対応で柔軟
- Prisma Client Extension でマルチテナント自動注入(ADR-002 参照)が綺麗に書ける

### PostgreSQL + pgvector

- 外部マネージドベクトル DB(Pinecone等)を避けることで運用シンプル
- pgvector の HNSW インデックスで実用的な検索速度(< 50ms)
- 1サービスでリレーショナル+ベクトル両対応
- **JSONB** で Stripe Webhook ペイロード等の半構造化データを生で保存・インデックス可能(MySQL の JSON 型より柔軟)
- **配列・enum 型・カスタム型がネイティブサポート**(マルチテナントロールや AI Feature 種別の表現が綺麗)
- **トランザクション分離レベルが標準的**(MySQL InnoDB の REPEATABLE READ 挙動の癖がない)
- 副業案件市場(2026 年時点)の B2B SaaS / スタートアップではデファクト。MySQL は WordPress / レガシー系が中心
- abcw は MySQL のみ経験のため、PostgreSQL を学ぶことで「両 DB 書ける」状態になり、副業面談で評価向上

#### MySQL との主要な差分(参考)

| 観点         | PostgreSQL                              | MySQL                            |
| ------------ | --------------------------------------- | -------------------------------- |
| JSON         | JSONB(インデックス可、強力)            | JSON 型はあるが PG ほど柔軟でない |
| ベクトル検索 | pgvector(公式拡張)                    | なし(別 DB 必須)               |
| 全文検索     | 組み込み + 多言語対応                   | 組み込み(FULLTEXT)             |
| 配列・enum   | ネイティブ                              | 配列なし、enum は弱い            |
| 採用例       | GitHub / Instagram / Reddit / Stripe / Notion | Facebook / Twitter / WordPress |

### Clerk

- 自前実装より3週間スコープが守れる(自前: 最低 3 日 / Clerk: 30 分)
- マルチテナント Organizations 機能を標準提供(ただし Shipyard は自前 Tenant モデルを使用、Organizations は補助的利用に留める)
- Webhook でユーザー DB ミラー可能(`user.created` 等)
- **無料枠が広い(月間 10,000 アクティブユーザーまで)**、MVP 期は実質無料で運用可能
- `@clerk/nextjs` が Next.js App Router に完全対応、`<SignIn />` `<SignUp />` 等のコンポーネントを置くだけで UI が完成
- 棄却した代替: Auth.js(設定複雑 + UI 自前)、Supabase Auth(AWS 中心構成と相性悪い)、自前実装(時間とセキュリティリスク過大)

### Stripe Subscriptions

- 業界標準、Webhook ドキュメント充実
- Subscription Quantity で人数課金が綺麗に表現できる(ADR-004 参照)
- 副業案件市場で必須スキル → 学習自体が資産になる

### Vercel + ECS Fargate + Aurora Serverless v2

- フロントは Vercel で開発体験最優先
- API は ECS Fargate でコンテナ運用 → AWS 実務経験の証明
- DB は Aurora Serverless v2 でアイドル時コスト最小化

### Anthropic API

- Claude Code 利用経験あり、内部の挙動理解
- Tool Use の構造化出力が安定
- Sonnet 4 と Haiku 4.5 の使い分けでコスト最適化(ADR-005 参照)

### Tailwind CSS + shadcn/ui

- **shadcn/ui はコピペ式**(`npx shadcn-ui add button` でソースコードを自分のリポジトリに取り込む)。npm install するライブラリではない
- 取り込んだコードは完全に自分のもの → Tailwind ベースで自由にカスタマイズ可能、ロックインなし
- Radix UI(アクセシブルなヘッドレス層)+ Tailwind(スタイリング層)の組み合わせで、アクセシビリティと自由度を両取り
- バンドルサイズが軽い(必要なコンポーネントだけ取り込む)
- Vercel・Linear・Resend 等のモダン B2B SaaS が採用、業界デファクト
- 「完成品」型(MUI / Chakra / Mantine)はカスタマイズが面倒で B2B SaaS の独自 UI に向かない、Tailwind のみだと土台がなく初速が出ない、その中間としての shadcn/ui が最適

### Redis(ElastiCache)+ BullMQ

- Redis はキャッシュ / レート制限カウンタ / セッション保存で**いずれにせよ必要**になる → 同インフラを BullMQ のキュー保存層として流用すれば追加コストゼロ
- BullMQ は TypeScript ファーストで NestJS との統合(`@nestjs/bullmq`)が綺麗、リトライ / 遅延実行 / 進捗通知 / Bull Board 管理画面が組み込み
- AI 競合調査(数十秒)/ Embedding 生成 / Webhook 失敗リトライ / 月次集計など、API リクエスト内で実行できない処理を非同期化
- 棄却した代替:
  - **AWS SQS + Lambda**: コスト最安だが、ステートフルな進捗通知や順序保証付きジョブが書きにくい、開発体験で BullMQ に劣る
  - **RabbitMQ**: 高機能だが運用コスト過大(専用インスタンス管理)、3 週間 MVP に過剰
  - **AWS Step Functions**: ベンダーロックが強く、ローカル開発が不可能、デバッグ困難

### Turborepo + pnpm Workspaces

- Monorepo 構成(`apps/web` + `apps/api` + `packages/db` + `packages/ui` + `packages/types`)で**フロント↔バック間の型を `packages/types` 経由で同期**できる
- API 仕様変更時、フロント側のビルドエラーで即座に検知 → SaaS 開発の整合性が構造的に担保される
- Turborepo の**ビルドキャッシュ**で変更されたパッケージだけ再ビルド(数十秒 → 数秒)、CI 時間も大幅短縮
- **Vercel リモートキャッシュ**を無料で利用可能(Vercel 統合)、チーム開発時もキャッシュ共有
- pnpm はディスク効率(ハードリンク方式)+ Workspaces 標準サポートで Turborepo と相性◎
- 棄却した代替:
  - **Nx**: 機能豊富だがエンタープライズ向けで学習コスト高、3 週間 MVP には過剰
  - **Lerna**: 現在はメンテモード、新規採用はリスク
  - **Rush**: Microsoft 製、設定が重く OSS では Turborepo に押されている
  - **Polyrepo**: 型同期のためにパッケージ公開が必要、個人開発の運用負荷が高い

## 結果

### 良い影響

- 自分の現職スタックと完全一致 → 学習コストゼロで実装に集中可能
- マルチテナント+Stripe+AI のフルセットを副業面談材料化できる
- 各技術が市場で需要高く、ポートフォリオの価値が高い
- shadcn/ui によりコンポーネントが自分のコードになるため、UI のカスタマイズが自由 + 面談で「コピペ式 UI ライブラリの選定理由」を語れる
- Turborepo + pnpm Workspaces による型同期で、API 仕様変更を構造的に検知 + ビルドキャッシュで CI 高速化 → 副業面談で「モダン Monorepo 経験」が語れる
- MySQL のみ経験から PostgreSQL も書けるエンジニアに拡張、案件市場での評価向上
- Redis + BullMQ の選定により非同期処理経験が増え、B2B SaaS 案件で頻出のキュー設計を語れる

### 悪い影響・リスク

- ECS Fargate の運用コストが Vercel 一本化より高い → 月数千円増のリスク
- Anthropic API のコストが想定外に膨らむ可能性 → AIUsage テーブルで監視(ADR-005 参照)
- Clerk の月額費用(無料枠 10,000 MAU 超過時)→ 当面は無料枠内で運用
- shadcn/ui はコピペ式のため**自動アップデート追従ができない** → メジャー更新時に手動マージが必要
- Turborepo の Vercel リモートキャッシュに依存すると Vercel 障害時 CI が遅延 → ローカルキャッシュへのフォールバックを CI 設定で担保
- PostgreSQL 学習コスト(MySQL からの移行)→ 数日で吸収可能、Prisma が大半の差分を吸収するため実装中の摩擦は限定的

### フォローアップ

- ECS Fargate のコスト試算を Week 3 のデプロイ前に実施
- Anthropic API のトークン上限を Free プランで月20回に制限
- Vercel と ECS の通信レイテンシを計測、必要なら BFF パターンを導入
- Clerk の利用状況を月次でレビュー、無料枠超過が見えたら Auth.js への移行を検討
- shadcn/ui の `components.json` をバージョン管理し、更新追従ルール(四半期に 1 回見直す等)を Day 3 で確立
- Turborepo のリモートキャッシュを Day 3 で Vercel と接続、CI 設定でローカルキャッシュへのフォールバックを担保
- PostgreSQL 固有機能(JSONB 検索 / 配列クエリ / pgvector)の実装サンプルを Week 2 のドキュメント化対象に含める
