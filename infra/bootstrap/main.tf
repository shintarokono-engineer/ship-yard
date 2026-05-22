# bootstrap/main.tf
# Terraform state を保存する S3 バケットを作成する(初回 1 度だけローカル state で apply)。
#
# chicken-and-egg 解消用: 本体構成(../prod)は state を S3 に置くが、その S3
# 自体を Terraform で作るには state 置き場が要る。この bootstrap だけはローカル
# state で 1 度だけ apply し、以降のバケット管理に使う。bootstrap の state は
# ローカル(infra/bootstrap/terraform.tfstate)に残るが、バケットは import で
# 復元可能なため再生成は容易。

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-northeast-1"

  default_tags {
    tags = {
      Project   = "shipyard"
      ManagedBy = "terraform"
      Purpose   = "tfstate-bootstrap"
    }
  }
}

# バケット名は S3 グローバル一意。既に取得済みで衝突する場合は、ここと
# ../prod/backend.tf の bucket を同じ新しい名前へ変更する。
resource "aws_s3_bucket" "tfstate" {
  bucket = "shipyard-tfstate-ap-northeast-1"

  # state 消失は実リソースとの対応関係を失う最悪級の事故。誤 destroy を禁止する。
  lifecycle {
    prevent_destroy = true
  }
}

# state は誤削除・破損時に巻き戻せるよう必ずバージョニングする。
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

# state には生成パスワード等が平文で載りうるため暗号化する。SSE-S3(AES256)で統一し、
# prod/backend.tf の `encrypt = true` と方式を揃える(KMS にすると Day 38 のデプロイ
# ロールに KMS 権限が要るため、state バケットは AES256 とする)。
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 古い state バージョンが無期限に溜まらないよう noncurrent を 90 日で失効する。
resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    id     = "expire-noncurrent-state"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }

  # noncurrent 失効はバージョニング有効が前提。
  depends_on = [aws_s3_bucket_versioning.tfstate]
}

output "state_bucket" {
  description = "../prod/backend.tf の bucket に設定する state バケット名"
  value       = aws_s3_bucket.tfstate.id
}
