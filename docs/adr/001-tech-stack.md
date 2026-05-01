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

## 決定

- **フロント**: Next.js (App Router) + TypeScript + Tailwind CSS
- **バック**: NestJS + Prisma
- **DB**: PostgreSQL 16 + pgvector
- **認証**: Clerk
- **決済**: Stripe Subscriptions
- **インフラ**: Vercel(フロント)+ AWS ECS Fargate(API)+ RDS Aurora Serverless v2
- **AI**: Anthropic API

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

### Clerk

- 自前実装より3週間スコープが守れる
- マルチテナント Organizations 機能を標準提供
- Webhook でユーザー DB ミラー可能

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

## 結果

### 良い影響

- 自分の現職スタックと完全一致 → 学習コストゼロで実装に集中可能
- マルチテナント+Stripe+AI のフルセットを副業面談材料化できる
- 各技術が市場で需要高く、ポートフォリオの価値が高い

### 悪い影響・リスク

- ECS Fargate の運用コストが Vercel 一本化より高い → 月数千円増のリスク
- Anthropic API のコストが想定外に膨らむ可能性 → AIUsage テーブルで監視(ADR-005 参照)
- Clerk の月額費用(無料枠を超えた場合)→ 当面は無料枠内で運用

### フォローアップ

- ECS Fargate のコスト試算を Week 3 のデプロイ前に実施
- Anthropic API のトークン上限を Free プランで月20回に制限
- Vercel と ECS の通信レイテンシを計測、必要なら BFF パターンを導入
- Clerk の利用状況を月次でレビュー、無料枠超過が見えたら Auth.js への移行を検討
