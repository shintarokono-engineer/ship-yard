# monitoring.tf
# Day 39: CloudWatch アラームと AWS Budgets を定義する。アラート通知は SNS
# トピック経由でメール送信する(購読は初回に確認メールの承認が必要)。

resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.budget_alert_email
}

# --- RDS アラーム ---

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name_prefix}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS CPU が 80% を継続超過"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${local.name_prefix}-rds-storage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 2147483648 # 2 GiB(バイト)
  alarm_description   = "RDS の空きストレージが 2 GiB を下回った"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }
}

# --- App Runner アラーム(サービス作成時のみ)---

resource "aws_cloudwatch_metric_alarm" "apprunner_5xx" {
  count = var.enable_apprunner_service ? 1 : 0

  alarm_name          = "${local.name_prefix}-apprunner-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "5xxStatusResponses"
  namespace           = "AWS/AppRunner"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "App Runner の 5xx 応答が急増"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ServiceName = aws_apprunner_service.api[0].service_name
  }
}

# --- 内部ジョブの起動失敗アラーム(F20)---

resource "aws_cloudwatch_metric_alarm" "trial_reminders_failed" {
  alarm_name          = "${local.name_prefix}-trial-reminders-failed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FailedInvocations"
  namespace           = "AWS/Events"
  period              = 86400
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "トライアル終了通知バッチの起動に失敗した(F20)"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    RuleName = aws_cloudwatch_event_rule.trial_reminders_daily.name
  }
}

# --- 月次予算アラート(クレジット枯渇後の課金事故防止、ADR-011)---

resource "aws_budgets_budget" "monthly" {
  name         = "${local.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # 実績が 80 / 100 / 120%、または着地見込みが 100% を超えたらメール通知する。
  #
  # 50% 閾値は使わない:固定フロア(月 $36〜48)が予算の半分を超えるため毎月必ず発火し、
  # アラートが常態化して本当の異常に気付けなくなる(docs/infrastructure-cost.md §2.7)。
  # 代わりに 120% を足して暴走(想定外リソースの起動等)を捕捉する。
  #
  # 注意:AWS Budgets は**クレジット適用後の実請求額**で判定されるため、初期クレジットが
  # 残っている間は発火しない。クレジットで隠れている本来のコストは Cost Explorer 側で確認する。
  dynamic "notification" {
    for_each = [
      { type = "ACTUAL", threshold = 80 },
      { type = "ACTUAL", threshold = 100 },
      { type = "ACTUAL", threshold = 120 },
      { type = "FORECASTED", threshold = 100 },
    ]

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value.threshold
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value.type
      subscriber_email_addresses = [var.budget_alert_email]
    }
  }
}

# --- VPC Flow Logs(通信監査・インシデント調査用)---

resource "aws_cloudwatch_log_group" "vpc_flow" {
  name_prefix       = "/${var.project}/${var.environment}/vpc-flow-"
  retention_in_days = 14
}

# Flow Logs が CloudWatch Logs へ書き込むためのロール。
data "aws_iam_policy_document" "flow_log_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "flow_log" {
  name_prefix        = "${local.name_prefix}-flowlog-"
  assume_role_policy = data.aws_iam_policy_document.flow_log_assume.json
}

data "aws_iam_policy_document" "flow_log" {
  statement {
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "flow_log" {
  name   = "flow-log"
  role   = aws_iam_role.flow_log.id
  policy = data.aws_iam_policy_document.flow_log.json
}

resource "aws_flow_log" "main" {
  vpc_id = aws_vpc.main.id

  # REJECT のみを記録する(コスト最適化、docs/infrastructure-cost.md §3.2 A)。
  # Flow Logs は CloudWatch Logs の取り込み量で課金されるため、ALL(正常通信も全量記録)
  # だとトラフィックに比例して費用が増える。主用途である「SG / ルーティングの誤設定調査」
  # は拒否ログで足りるため MVP では REJECT に絞る。正常通信の事後追跡が必要になったら
  # ALL に戻す(監査要件が出た場合など)。
  traffic_type    = "REJECT"
  log_destination = aws_cloudwatch_log_group.vpc_flow.arn
  iam_role_arn    = aws_iam_role.flow_log.arn

  tags = {
    Name = "${local.name_prefix}-vpc-flow-log"
  }
}

# ---------------------------------------------------------------------------
# AI プロバイダのアカウント設定不備(クレジット枯渇 / API キー失効)の検知
#
# 2026-08-04 に本番で Anthropic のクレジットが枯渇し、LP 生成が全て失敗した。
# **ユーザーには「生成に失敗しました」としか出ず、運営側も気付く手段が無かった**ため、
# ログのマーカー文字列を拾って通知する。
#
# アプリから直接 SNS を publish しない理由:
#   - インスタンスロールに sns:Publish の IAM 追加が必要になる
#   - 障害時に通知経路自体が失敗しうる(AI が落ちている = 何かが不安定な状況)
# ログ経由なら経路が独立し、アプリ側は Logger.error を出すだけで済む。
#
# マーカーは apps/api/src/ai/ai-error.ts の translateAIProviderError が出力する。
# **文字列を変える場合は両方を同時に直すこと。**
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_metric_filter" "ai_provider_account_error" {
  count = var.enable_apprunner_service ? 1 : 0

  name           = "${local.name_prefix}-ai-provider-account-error"
  log_group_name = "/aws/apprunner/${local.name_prefix}-api/${aws_apprunner_service.api[0].service_id}/application"
  pattern        = "AI_PROVIDER_ACCOUNT_ERROR"

  metric_transformation {
    name      = "AIProviderAccountError"
    namespace = "Neorie/API"
    value     = "1"
    unit      = "Count"
    # 発生が無いときは 0 を報告させる。これが無いと missing data 扱いになり、
    # treat_missing_data の設定次第でアラームが INSUFFICIENT_DATA に落ちる。
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "ai_provider_account_error" {
  count = var.enable_apprunner_service ? 1 : 0

  alarm_name        = "${local.name_prefix}-ai-provider-account-error"
  alarm_description = <<-EOT
    AI プロバイダのアカウント設定不備(クレジット残高切れ / API キー失効)を検知した。
    ユーザーの AI 機能が全て停止しているので即対応が必要。

    確認先:
      Anthropic https://console.anthropic.com  → Plans & Billing
      OpenAI    https://platform.openai.com/settings/organization/billing

    キーを入れ直した場合は Secrets Manager 更新後に再デプロイが要る:
      aws apprunner start-deployment --service-arn <ARN>
  EOT

  namespace           = "Neorie/API"
  metric_name         = "AIProviderAccountError"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  # 0 を default_value で報告しているので missing は起きない想定だが、
  # 念のため「データ無し = 正常」に倒す(誤報より取りこぼしを避ける設計ではない)。
  treat_missing_data = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.name_prefix}-ai-provider-account-error"
  }
}
