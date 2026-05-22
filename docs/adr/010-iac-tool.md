# ADR-010: IaC ツールに Terraform を採用

## ステータス

承認済み(2026-05-22)

## 背景・問題

Week 5(Day 34-39)で AWS 本番インフラを構築する。`architecture.md` で次の構成が確定済み。

- ECS Fargate(API Server / Background Worker)+ Application Load Balancer
- RDS Aurora Serverless v2(PostgreSQL + pgvector)
- ElastiCache(Redis)
- VPC / Public・Private Subnet / NAT Gateway
- ECR / S3 / Secrets Manager / CloudWatch / Route53 / ACM

これらを AWS マネジメントコンソールの手作業で構築すると、構成の記録が残らず、本番と将来のステージング環境で設定がずれ、誰がいつ何を変えたか追えない。インフラ構成をコードで宣言し、レビュー・バージョン管理・再現可能なデプロイを可能にする IaC(Infrastructure as Code)ツールを 1 つ選定する必要がある。

本プロジェクトは「マルチテナント + Stripe + AI のフルセット経験を語れる状態」を開発ゴールに含む(§1)。インフラのコード化はその経験の一部であり、ツール選定はこのゴールにも影響する。

関連:`architecture.md`(AWS デプロイ構成)、PROJECT_STATUS.md §6 Week 5

## 検討した選択肢

### A. Terraform(HashiCorp)

- 概要:HCL(宣言的言語)でリソースを定義。`terraform plan` で差分プレビュー、`terraform apply` で適用。実リソースの状態は state ファイルで管理し、S3 等のリモートバックエンドに置く
- 長所:
  - **IaC の業界デファクト**。求人での出現頻度が最も高く、汎用スキルとして面談で語れる価値が最大(§1 の開発ゴールに直結)
  - クラウド中立。将来 AWS 以外のリソース(Cloudflare / Vercel / 監視 SaaS)を同じツールで管理できる
  - `plan` の差分が明示的で、適用前に変更内容をレビューしやすい
  - Module による再利用、`for_each` での反復が成熟している
- 短所:
  - HCL という専用言語の習得が必要(本プロジェクトの TS スタックとは別)
  - state ファイルの置き場(S3 バケット + ロック)を最初にブートストラップする必要がある
  - AWS 本体とは別の CLI ツール(`terraform`)の導入が必要

### B. AWS CDK(TypeScript)

- 概要:TypeScript でインフラを定義し、裏で CloudFormation テンプレートを生成して適用する
- 長所:
  - 既存の pnpm + turbo モノレポに `apps/infra` として統合でき、`tsconfig` / ESLint / 型チェックを共有できる
  - TS エンジニアにとって学習コストが低い(言語は既知、AWS construct のみ習得)
  - L2 construct が VPC + Subnet + NAT + Route Table を安全な既定値ごと数行で生成し、記述量が少ない
  - state は CloudFormation 側が管理するため、別途バックエンドの準備が不要
- 短所:
  - AWS 専用(クラウド中立性がない)
  - IaC スキルの汎用デファクト度では Terraform にやや劣る

### C. CloudFormation(YAML)

- 概要:AWS 純正の IaC。YAML / JSON でリソースを直接記述する。CDK が裏で生成しているのもこれ
- 長所:追加ツール不要(AWS CLI のみ)。AWS ネイティブ
- 短所:
  - YAML が冗長で、モジュール化・再利用・型チェックが弱い
  - 規模が大きくなると保守がつらい。実質 CDK の下位互換であり、CDK があるなら生で選ぶ理由が薄い

## 決定

**A 案(Terraform)を採用する。**

インフラ定義は `infra/` ディレクトリ(モノレポルート直下、pnpm workspace 外)に配置する。

- リージョン:`ap-northeast-1`(東京、`architecture.md` の「AWS Tokyo」に準拠)
- state バックエンド:S3 リモートバックエンド。ロックは Terraform 1.10+ の S3 ネイティブロック(`use_lockfile = true`)を用い、DynamoDB ロックテーブルは設けない
- state 用 S3 バケット自体の chicken-and-egg は `infra/bootstrap/`(ローカル state で 1 度だけ apply)で解決する
- ディレクトリ構成・Module 分割の詳細は実装時(Day 34)に確定する

## 理由

- **採用理由の核心**:本プロジェクトの開発ゴール(§1)に「インフラ経験を面談で語れる状態」が含まれる。IaC スキルの汎用デファクト度では Terraform が最も広く通用し、クラウド中立性により AWS 以外のリソース(Cloudflare / Vercel / 監視 SaaS)も将来同じツールで扱える。CDK の「既存 TS モノレポへの統合」「学習コストの低さ」という利点は認識した上で、**汎用スキルとしての価値**を優先した
- **トレードオフの受容**:HCL の学習コストと state バックエンドのブートストラップ手間が発生する。これは初回の一度きりのコストであり、Day 34 の冒頭で吸収できる範囲と判断した
- **棄却理由**:
  - B(CDK):AWS 専用かつデファクト度で劣る。TS 統合の利点は本プロジェクトでは決定打にならない
  - C(CloudFormation):YAML の冗長さと保守性の低さ。CDK の下位互換であり積極的に選ぶ理由がない

## 結果(Consequences)

### 良い影響

- インフラ構成が `infra/` のコードとして Git 管理され、PR レビュー・変更履歴・再現可能なデプロイが可能になる
- `terraform plan` により、本番への変更を適用前に差分で確認できる
- クラウド中立なため、将来の外部リソース(DNS / CDN / 監視)も同一ツールに集約できる
- Terraform の実務経験が副業面談の材料になる(§1 の開発ゴール)

### 悪い影響・リスク

- **HCL の学習コスト**:TS スタックとは別言語。対策:Day 34 で VPC / Subnet / IAM / SG / ECR という比較的単純なリソースから着手し、段階的に習熟する
- **state ファイルの管理責任**:state には機微情報(生成パスワード等)が平文で含まれうる。対策:state 用 S3 バケットは暗号化 + バージョニング + パブリックアクセス全ブロックを必須とし、`infra/bootstrap/` で強制する
- **state バックエンドの chicken-and-egg**:state を置く S3 バケット自体を Terraform で作る矛盾。対策:`infra/bootstrap/` をローカル state で 1 度だけ apply してバケットを作り、以降の本体構成はそのバケットをリモートバックエンドとして使う
- **`terraform` CLI の別途導入**:CI / ローカルでバージョンを揃える必要がある。対策:`infra/` に `.terraform-version`(tfenv 用)を置き、`required_version` で固定する

### フォローアップ

#### Week 5 で実施(本 ADR の実装)

> Day 35 以降の構成は ADR-011(軽量 AWS)で改訂済み。下記は改訂後の内容。

- Day 34:`infra/bootstrap/`(state 用 S3)+ VPC / Subnet / IGW / Route / Security Group / IAM ロール / ECR
- Day 35:RDS PostgreSQL `db.t4g.micro`(pgvector)
- Day 36:NAT インスタンス + App Runner(API)+ VPC コネクタ
- Day 37:Route53 / ACM
- Day 38:GitHub Actions から App Runner / `terraform apply` の CI/CD 化

#### v2 以降で検討

- ステージング環境の追加(workspace or ディレクトリ分離での環境多重化)
- `terraform plan` の PR コメント自動投稿(Atlantis / GitHub Actions)

#### 将来の見直しトリガー

- ステージング / 本番で構成差分が増え、環境多重化の方式(workspace / ディレクトリ / Terragrunt)を決める必要が出た場合
