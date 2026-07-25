# ecr.tf
# コンテナイメージ用の ECR リポジトリとライフサイクルポリシーを定義する。

# API(NestJS)のコンテナイメージを格納する ECR リポジトリ。
# Web(Next.js)は Vercel でホスティングするため(ADR-011)コンテナ化せず、
# ECR リポジトリも設けない。BullMQ worker は API と同一イメージで動かす想定
# (App Runner 上の配置は Day 36 で確定)。
locals {
  ecr_repositories = ["api"]
}

resource "aws_ecr_repository" "this" {
  for_each = toset(local.ecr_repositories)

  name = "${var.project}/${each.value}"

  # 同一タグの上書き push を禁止し、デプロイ済みイメージの不変性を保証する。
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# 未タグイメージ(古いビルドの中間レイヤ等)が溜まり続けるのを防ぐ。
#
# for_each には `aws_ecr_repository.this` ではなく `toset(local.ecr_repositories)` を
# 渡す。リソースを直接渡すと、リポジトリ未作成の状態では key が apply 後にしか
# 確定せず、Terraform が「for_each のキーが plan 時に決められない」として
# plan / import / apply すべてを拒否する(Invalid for_each argument)。
# キーは静的に決め、apply 後に確定する値は「値」側だけで参照する。
resource "aws_ecr_lifecycle_policy" "this" {
  for_each = toset(local.ecr_repositories)

  repository = aws_ecr_repository.this[each.key].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images older than 14 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 14
        }
        action = {
          type = "expire"
        }
      },
    ]
  })
}
