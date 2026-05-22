# apprunner.tf
# Day 36: App Runner(API)と VPC コネクタを定義する。App Runner は HTTPS 内蔵
# のマネージドサービスで ALB を要さない。VPC コネクタ経由で RDS に接続し、
# 外向き通信は NAT インスタンス経由になる(ADR-011)。
#
# App Runner サービスは ECR に API イメージが push 済みになるまで作成できない
# ため、enable_apprunner_service 変数で作成可否を切り替える(既定 false)。
# API のコンテナ化(apps/api/Dockerfile)と env / Secrets 連携は Day 37 の
# 本番連携で詰める。

# VPC コネクタ: App Runner を VPC に接続する。これを付けると App Runner の
# 外向き通信が全量 VPC 経由(= NAT 経由)になる。
resource "aws_apprunner_vpc_connector" "main" {
  vpc_connector_name = "${local.name_prefix}-connector"
  subnets            = aws_subnet.private[*].id
  security_groups    = [aws_security_group.apprunner.id]

  tags = {
    Name = "${local.name_prefix}-connector"
  }
}

resource "aws_apprunner_service" "api" {
  count = var.enable_apprunner_service ? 1 : 0

  service_name = "${local.name_prefix}-api"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_access.arn
    }

    image_repository {
      # 初回作成時のタグ。以降は GitHub Actions が update-service で更新し、
      # 下の ignore_changes で Terraform は追従しない。ECR は IMMUTABLE のため
      # apprunner_image_tag は実在タグ(コミット SHA)を指定すること。
      image_identifier      = "${aws_ecr_repository.this["api"].repository_url}:${var.apprunner_image_tag}"
      image_repository_type = "ECR"

      image_configuration {
        # NestJS API のリッスンポート。
        port = "3000"
      }
    }

    # デプロイは GitHub Actions(Day 38)から明示的に行う。
    auto_deployments_enabled = false
  }

  instance_configuration {
    cpu               = var.apprunner_cpu
    memory            = var.apprunner_memory
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  # 外向き通信を VPC コネクタ経由にし、Private Subnet の RDS へ到達させる。
  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.main.arn
    }
  }

  tags = {
    Name = "${local.name_prefix}-api"
  }

  # デプロイするイメージタグは GitHub Actions(Day 38)が更新するため、
  # Terraform は image_identifier の変化を無視する。
  lifecycle {
    ignore_changes = [source_configuration[0].image_repository[0].image_identifier]
  }
}

# App Runner インスタンスロールに RDS マスターユーザーシークレットの読み取りを
# 許可する(App Runner の runtime secrets で DB 認証情報を注入するため)。
data "aws_iam_policy_document" "apprunner_rds_secret" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_db_instance.main.master_user_secret[0].secret_arn]
  }
}

resource "aws_iam_role_policy" "apprunner_rds_secret" {
  name   = "rds-secret-access"
  role   = aws_iam_role.apprunner_instance.id
  policy = data.aws_iam_policy_document.apprunner_rds_secret.json
}
