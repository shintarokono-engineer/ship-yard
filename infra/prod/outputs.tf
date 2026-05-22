# outputs.tf
# 他リソースの設定や運用で参照する値を出力する。

# --- ネットワーク ---

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public Subnet ID 一覧(NAT インスタンス配置用)"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private Subnet ID 一覧(RDS / App Runner VPC コネクタ配置用)"
  value       = aws_subnet.private[*].id
}

output "nat_instance_id" {
  description = "NAT インスタンスの EC2 ID"
  value       = aws_instance.nat.id
}

output "nat_public_ip" {
  description = "NAT インスタンスの EIP(外向き通信の固定送信元 IP)"
  value       = aws_eip.nat.public_ip
}

# --- Security Group ---

output "nat_security_group_id" {
  description = "NAT インスタンス用 Security Group ID"
  value       = aws_security_group.nat.id
}

output "apprunner_security_group_id" {
  description = "App Runner VPC コネクタ用 Security Group ID"
  value       = aws_security_group.apprunner.id
}

output "rds_security_group_id" {
  description = "RDS 用 Security Group ID"
  value       = aws_security_group.rds.id
}

# --- IAM ---

output "apprunner_access_role_arn" {
  description = "App Runner アクセスロール ARN(ECR pull 用)"
  value       = aws_iam_role.apprunner_access.arn
}

output "apprunner_instance_role_arn" {
  description = "App Runner インスタンスロール ARN(アプリ実行時権限)"
  value       = aws_iam_role.apprunner_instance.arn
}

output "github_deploy_role_arn" {
  description = "GitHub Actions デプロイロール ARN(Secrets の AWS_DEPLOY_ROLE_ARN に設定)"
  value       = aws_iam_role.github_deploy.arn
}

# --- ECR ---

output "ecr_repository_urls" {
  description = "ECR リポジトリ URL(リポジトリ名 => URL)"
  value       = { for k, repo in aws_ecr_repository.this : k => repo.repository_url }
}

# --- RDS ---

output "rds_endpoint" {
  description = "RDS エンドポイント(host:port)"
  value       = aws_db_instance.main.endpoint
}

output "rds_db_name" {
  description = "データベース名"
  value       = aws_db_instance.main.db_name
}

output "rds_master_secret_arn" {
  description = "RDS マスターユーザー認証情報の Secrets Manager ARN"
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
}

# --- App Runner ---

output "apprunner_vpc_connector_arn" {
  description = "App Runner VPC コネクタ ARN"
  value       = aws_apprunner_vpc_connector.main.arn
}

output "apprunner_service_arn" {
  description = "App Runner サービス ARN(未作成時は null。Secrets の APPRUNNER_SERVICE_ARN に設定)"
  value       = one(aws_apprunner_service.api[*].arn)
}

output "apprunner_service_url" {
  description = "App Runner サービスの既定 URL(未作成時は null)"
  value       = one(aws_apprunner_service.api[*].service_url)
}

# --- DNS / 監視 ---

output "route53_zone_id" {
  description = "Route53 ホストゾーン ID"
  value       = aws_route53_zone.main.zone_id
}

output "route53_name_servers" {
  description = "Route53 のネームサーバー(ドメインレジストラに設定する)"
  value       = aws_route53_zone.main.name_servers
}

output "sns_alerts_topic_arn" {
  description = "アラート通知用 SNS トピック ARN"
  value       = aws_sns_topic.alerts.arn
}
