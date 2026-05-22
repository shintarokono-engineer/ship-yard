# infra — Shipyard AWS インフラ(Terraform)

Shipyard の本番 AWS インフラを Terraform で管理する。ツール選定の経緯は
[ADR-010](../docs/adr/010-iac-tool.md)、構成(軽量 AWS = Vercel + App Runner +
RDS + Upstash)の経緯は [ADR-011](../docs/adr/011-lightweight-aws-architecture.md) を参照。

## 前提

- Terraform `>= 1.10`(`.terraform-version` で固定、[tfenv](https://github.com/tfutils/tfenv) 推奨)
- AWS 認証情報(`aws configure` 済み、または環境変数)
- リージョン: `ap-northeast-1`(東京)

## ディレクトリ構成

```
infra/
  bootstrap/   state 保存用 S3 バケットを作る(初回 1 度だけ)
  prod/        本番環境の構成本体
```

将来ステージング環境を追加する場合は `prod/` と同様の `staging/` を切る(ADR-010 フォローアップ)。

Web(Next.js)は Vercel、API(NestJS)は AWS App Runner、DB は RDS、Redis は Upstash で
ホスティングする(ADR-011)。`infra/` が管理するのは AWS 側のリソースのみ。

## 初期セットアップ

### 1. state バケットの作成(初回のみ)

`prod/` は state を S3 に置くが、その S3 自体をまず作る必要がある。
`bootstrap/` はローカル state で 1 度だけ apply する。

```bash
cd infra/bootstrap
terraform init
terraform apply
```

> S3 バケット名はグローバル一意。`shipyard-tfstate-ap-northeast-1` が取得済みで
> 衝突する場合は `bootstrap/main.tf` と `prod/backend.tf` の `bucket` を同じ
> 新しい名前へ変更する。

### 2. 本体構成の適用

```bash
cd infra/prod
terraform init      # S3 backend へ接続
terraform plan      # 変更内容を確認
terraform apply
```

## prod で管理するリソース(Day 34 時点)

| ファイル | リソース |
| --- | --- |
| `network.tf` | VPC / Public・Private Subnet ×2AZ / IGW / Route Table |
| `security.tf` | Security Group(NAT インスタンス / App Runner VPC コネクタ / RDS) |
| `iam.tf` | App Runner アクセスロール / インスタンスロール |
| `ecr.tf` | ECR リポジトリ(`shipyard/api`) |

RDS(Day 35)、NAT インスタンス・App Runner・VPC コネクタ(Day 36)、Route53 / ACM
(Day 37)は後続の Day で追加する。NAT インスタンス向けの Private Subnet ルートも
Day 36 で追加する。

## 運用メモ

- `terraform plan` の差分を必ず確認してから `apply` する。
- `.terraform.lock.hcl` はコミットする(プロバイダのバージョン固定)。
- `*.tfstate` / `*.tfvars` はコミットしない(`.gitignore` 済み)。
- state ロックは S3 ネイティブロック(`use_lockfile`)。DynamoDB テーブルは不要。
