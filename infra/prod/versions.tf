# versions.tf
# Terraform 本体と AWS プロバイダのバージョン制約を定義する。

terraform {
  # S3 ネイティブロック(use_lockfile)は Terraform 1.10 以降の機能。
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
