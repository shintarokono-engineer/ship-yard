# backend.tf
# Terraform state の保存先(S3 リモートバックエンド)を定義する。

terraform {
  # state ロックは S3 ネイティブロック(use_lockfile)を使い、DynamoDB ロック
  # テーブルは設けない(ADR-010)。bucket は infra/bootstrap で作成済みのもの。
  # backend ブロックは変数・data を参照できないため値はリテラルで持つ。
  backend "s3" {
    bucket       = "shipyard-tfstate-ap-northeast-1"
    key          = "prod/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
