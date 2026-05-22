# outputs.tf
# 後続 Day(35-36)が参照するリソース ID 群(VPC / Subnet / SG / IAM / ECR)を出力する。

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

output "apprunner_access_role_arn" {
  description = "App Runner アクセスロール ARN(ECR pull 用)"
  value       = aws_iam_role.apprunner_access.arn
}

output "apprunner_instance_role_arn" {
  description = "App Runner インスタンスロール ARN(アプリ実行時権限)"
  value       = aws_iam_role.apprunner_instance.arn
}

output "ecr_repository_urls" {
  description = "ECR リポジトリ URL(リポジトリ名 => URL)"
  value       = { for k, repo in aws_ecr_repository.this : k => repo.repository_url }
}
