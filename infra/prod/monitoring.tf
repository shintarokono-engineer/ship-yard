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
