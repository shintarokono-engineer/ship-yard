# ADR-011: 軽量 AWS 構成(Vercel + App Runner + RDS + Upstash)を採用

## ステータス

承認済み(2026-05-22)

## 背景・問題

Week 5 本番化の当初構成は ECS Fargate + Aurora Serverless v2 + ElastiCache + ALB だった
(`architecture.md` / PROJECT_STATUS §6)。この構成は常時稼働の固定費(フロア)が概算で
月 $90〜130 になる。

Shipyard は公開前・収益ゼロの個人開発 SaaS であり、2026-05-22 にユーザーから「インフラの
課金額が収益を上回る期間を最小化したい」という要望が出た。一方、開発ゴール(§1)には
「マルチテナント + Stripe + AI + AWS のフルセット経験を面談材料化する」も含まれ、コストと
ポートフォリオ価値のトレードオフがある。

Day 34 の段階(VPC / Subnet / SG / IAM / ECR)はすべて無料リソースで、課金が本格化するのは
Day 35 以降(DB / 計算基盤 / ロードバランサ)。そのため Day 35 以降の構成をコスト最適な形へ
組み替える判断が必要になった。

関連:ADR-010(IaC = Terraform)、ADR-005(AI 戦略、BullMQ worker)、`architecture.md`、
PROJECT_STATUS §6

## 検討した選択肢

フロアは東京リージョン・常時稼働・最小構成の概算。

### A. 重量 AWS(当初構成)

- 構成:ECS Fargate + Aurora Serverless v2 + ElastiCache + ALB
- フロア:月 $90〜130
- 長所:AWS の王道本番構成。ECS / Aurora の経験を面談で語れる価値が最大
- 短所:収益ゼロの段階でフロアが高い。黒字化に Team プラン約 6 人が必要

### B. 軽量 AWS(採用)

- 構成:Web = Vercel / API = App Runner / DB = RDS `db.t4g.micro` / Redis = Upstash /
  外向き通信 = NAT インスタンス
- フロア:月 ~$26(新規アカウントの初期クレジットで当面は実質 $0)
- 長所:フロアを 1/4 以下に圧縮。App Runner / RDS / VPC / Terraform の AWS・IaC 経験は
  維持できる。黒字化は Team プラン約 2 人
- 短所:Web と API が別基盤(Vercel / AWS)になりデプロイ系統が 2 つ。ECS の経験は積めない

### C. フル PaaS

- 構成:Vercel + Fly.io/Railway + Neon
- フロア:月 $0〜25
- 長所:最安・最小運用
- 短所:AWS 要素がほぼ消え、面談材料としての価値が大きく下がる

## 決定

**B 案(軽量 AWS)を採用する。**

| レイヤ        | 採用                                                               | 不採用にしたもの                       |
| ------------- | ------------------------------------------------------------------ | -------------------------------------- |
| Web(Next.js)  | Vercel                                                             | ECS / App Runner での Web ホスティング |
| API(NestJS)   | AWS App Runner                                                     | ECS Fargate + ALB                      |
| DB            | RDS PostgreSQL `db.t4g.micro`(Single-AZ、pgvector、private subnet) | Aurora Serverless v2                   |
| Redis(BullMQ) | Upstash Redis(serverless、無料枠)                                  | ElastiCache                            |
| 外向き通信    | NAT インスタンス(fck-nat、`t4g.nano`)                              | NAT Gateway                            |

### App Runner と RDS の接続(本構成の肝)

App Runner が private subnet の RDS に接続するには **VPC コネクタ**が必要。VPC コネクタを
付けると App Runner の**外向き通信が全量 VPC 経由**になる(宛先ごとに経路を分けられない)。
そのため外部 API(Anthropic / Stripe / Upstash)へ出るには VPC に NAT が要る。

NAT は NAT Gateway(月 ~$45)ではなく **NAT インスタンス**(`t4g.nano`、月 ~$3〜4)を使う。
RDS は private subnet のまま隔離でき、マルチテナント SaaS のデータ DB として安全。

### Week 5 ロードマップの改訂

| Day | 当初                          | 改訂後(本 ADR)                                                  |
| --- | ----------------------------- | --------------------------------------------------------------- |
| 34  | VPC / Subnet / IAM / SG / ECR | 同左(SG / IAM を App Runner 構成に、ECR は `api` のみ)          |
| 35  | Aurora + ElastiCache          | RDS `db.t4g.micro`(pgvector)                                    |
| 36  | ECS Fargate + ALB             | NAT インスタンス + App Runner(API)+ VPC コネクタ。Web は Vercel |
| 37  | Route53 / ACM                 | 同左 + 本番 Clerk / Stripe / Resend / Upstash 連携              |
| 38  | GitHub Actions → ECS          | GitHub Actions → App Runner / Terraform                         |
| 39  | 監視                          | 監視 + **AWS Budgets アラート**(クレジット枯渇後の課金事故防止) |

## 理由

- **採用理由の核心**:収益ゼロ期のフロアを月 ~$26 に抑え、「課金が収益を上回る」リスクを
  最小化する。新規 AWS アカウントの初期クレジットで当面は実質無料、その後も Team プラン
  約 2 人で黒字化できる水準。
- **ポートフォリオ価値の維持**:App Runner / RDS / VPC / NAT / IAM を Terraform で構築する
  構成であり、AWS・IaC 経験は十分に語れる。ECS の経験は積めないが、収益性とのトレードオフ
  として受容する。
- **棄却理由**:
  - A:収益ゼロ期のフロアが高すぎる。Aurora の高可用性・ECS のスケール能力は MVP 段階では
    過剰
  - C:AWS 要素がほぼ消え、開発ゴール §1 のポートフォリオ目的を満たさない

## 結果(Consequences)

### 良い影響

- 本番フロアが月 ~$130 → ~$26 に低下。初期クレジット期間中(目安 6 ヶ月)は実質無料で運用可能
- Day 34 で構築済みの VPC / Subnet を活かせる(破棄が発生しない)
- App Runner は HTTPS 内蔵・~0 スケールで、ALB の管理と固定費が不要

### 悪い影響・リスク

- **App Runner + VPC コネクタは egress 全量が VPC 経由** → NAT が必須。NAT インスタンスで
  対応するが、NAT Gateway のマネージド冗長性は無い:
  - 対策:NAT インスタンスは単一障害点。MVP では許容し、障害時は Terraform で再作成。
    将来トラフィックが増えたら NAT Gateway へ移行
- **Web(Vercel)と API(AWS)で基盤が分かれる** → デプロイパイプラインが 2 系統:
  - 対策:Day 38 で Vercel 連携と App Runner デプロイを別々に整備
- **Upstash は AWS 外の SaaS**:
  - 対策:接続情報は Secrets で管理。BullMQ は Upstash で動作する(接続オプションの調整が
    必要な場合あり)
- **`architecture.md` の本番構成が陳腐化**(ECS / Aurora / ElastiCache 前提のまま):
  - 対策:Day 36 で `architecture.md` を本 ADR の構成に追従更新
- **初期クレジットには有効期限がある** → 枯渇後に課金が始まる:
  - 対策:Day 39 で AWS Budgets アラートを必須設定。Cost Anomaly Detection も有効化

### フォローアップ

- Day 35-39:上記改訂ロードマップの実装
- Day 36:`architecture.md` を軽量 AWS 構成へ更新
- Day 39:AWS Budgets アラート(月予算 + 50/80/100% 通知)
- v2 以降:トラフィック増に応じて NAT インスタンス → NAT Gateway、RDS → Multi-AZ /
  Aurora、App Runner → ECS の移行を再評価
