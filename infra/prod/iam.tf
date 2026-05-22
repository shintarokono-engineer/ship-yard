# iam.tf
# App Runner 用の IAM ロール(アクセスロール / インスタンスロール)を定義する。

# アクセスロール: App Runner サービスが ECR からコンテナイメージを pull する
# ために使う(App Runner 基盤側の権限)。
data "aws_iam_policy_document" "apprunner_build_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["build.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apprunner_access" {
  name_prefix        = "${local.name_prefix}-apprunner-access-"
  assume_role_policy = data.aws_iam_policy_document.apprunner_build_assume.json
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr" {
  role       = aws_iam_role.apprunner_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# インスタンスロール: App Runner で動くアプリ自身の権限。S3 / Secrets Manager
# 等へのアクセスポリシーは対象が確定する Day 36 で追加する(Day 34 はロールの
# 器のみ作成)。
data "aws_iam_policy_document" "apprunner_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["tasks.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apprunner_instance" {
  name_prefix        = "${local.name_prefix}-apprunner-instance-"
  assume_role_policy = data.aws_iam_policy_document.apprunner_tasks_assume.json
}
