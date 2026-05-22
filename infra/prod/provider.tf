# provider.tf
# AWS プロバイダの設定(リージョン・全リソース共通タグ)と共通ローカル値を定義する。

provider "aws" {
  region = var.aws_region

  # 全リソースに共通タグを自動付与する(個別の tags は Name 等の固有値のみ)。
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name_prefix = "${var.project}-${var.environment}"
}
