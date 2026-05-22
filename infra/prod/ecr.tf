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
resource "aws_ecr_lifecycle_policy" "this" {
  for_each = aws_ecr_repository.this

  repository = each.value.name

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
