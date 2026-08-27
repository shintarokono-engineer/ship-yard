# -----------------------------------------------------------------------------
# 内部ジョブの日次実行(F20 トライアル終了通知、ADR-012 v1.x)
#
# EventBridge Scheduler は任意の HTTPS を直接ターゲットにできない(ターゲットは Lambda /
# SQS / SNS 等の AWS API のみ)ため、Rule + API destination の構成を採る。
# 将来 F15 Reconciliation バッチを足すときは、rule / target / api_destination を
# 1 組追加すれば済む(connection と IAM ロールの trust policy は汎用なので共用できる)。
# ただし IAM ロールにアタッチしているポリシー(eventbridge_invoke_api)の resources は
# 現状 trial_reminders の ARN を単一指定しているため、新しい api_destination の ARN を
# この resources に追加する編集が別途必要になる。
# -----------------------------------------------------------------------------

# API key 認証。値は Secrets Manager の INTERNAL_JOB_TOKEN と一致させる(手動投入)。
resource "aws_cloudwatch_event_connection" "internal_job" {
  name               = "${local.name_prefix}-internal-job"
  description        = "Neorie API の内部ジョブエンドポイント認証"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key = "X-Internal-Job-Token"
      # 実値はコンソール / CLI で手動投入する。terraform state に平文を残さないため
      # プレースホルダで作成し、以降の差分は無視する。
      value = "REPLACE_ME"
    }
  }

  lifecycle {
    ignore_changes = [auth_parameters]
  }
}

resource "aws_cloudwatch_event_api_destination" "trial_reminders" {
  name                             = "${local.name_prefix}-trial-reminders"
  description                      = "トライアル終了通知バッチの起動先"
  invocation_endpoint              = "https://api.${var.domain_name}/internal/jobs/trial-reminders"
  http_method                      = "POST"
  invocation_rate_limit_per_second = 1
  connection_arn                   = aws_cloudwatch_event_connection.internal_job.arn
}

resource "aws_cloudwatch_event_rule" "trial_reminders_daily" {
  name                = "${local.name_prefix}-trial-reminders-daily"
  description         = "毎日 03:00 UTC(12:00 JST)にトライアル終了通知バッチを起動する"
  schedule_expression = "cron(0 3 * * ? *)"
}

resource "aws_cloudwatch_event_target" "trial_reminders" {
  rule     = aws_cloudwatch_event_rule.trial_reminders_daily.name
  arn      = aws_cloudwatch_event_api_destination.trial_reminders.arn
  role_arn = aws_iam_role.eventbridge_invoke_api.arn
}

# --- EventBridge が API destination を叩くための実行ロール ---

data "aws_iam_policy_document" "eventbridge_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eventbridge_invoke_api" {
  name               = "${local.name_prefix}-eventbridge-invoke-api"
  assume_role_policy = data.aws_iam_policy_document.eventbridge_assume.json
}

data "aws_iam_policy_document" "eventbridge_invoke_api" {
  statement {
    actions   = ["events:InvokeApiDestination"]
    resources = [aws_cloudwatch_event_api_destination.trial_reminders.arn]
  }
}

resource "aws_iam_role_policy" "eventbridge_invoke_api" {
  name   = "${local.name_prefix}-eventbridge-invoke-api"
  role   = aws_iam_role.eventbridge_invoke_api.id
  policy = data.aws_iam_policy_document.eventbridge_invoke_api.json
}
