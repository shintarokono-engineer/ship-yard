# rds.tf
# Day 35: RDS PostgreSQL を定義する。Private Subnet に配置し、App Runner VPC
# コネクタからのみ接続を許可する(security.tf の rds SG)。pgvector 拡張は
# 接続後に `CREATE EXTENSION vector;` で有効化する(パラメータグループ不要)。

# RDS を 2AZ の Private Subnet に配置するためのサブネットグループ。
resource "aws_db_subnet_group" "main" {
  name_prefix = "${local.name_prefix}-db-"
  subnet_ids  = aws_subnet.private[*].id

  tags = {
    Name = "${local.name_prefix}-db-subnet-group"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# 全 DB 接続を TLS 必須にするパラメータグループ。
resource "aws_db_parameter_group" "main" {
  name_prefix = "${local.name_prefix}-pg16-"
  family      = "postgres16"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "main" {
  identifier     = "${local.name_prefix}-db"
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  db_name  = var.db_name
  username = var.db_username
  # マスターパスワードは Secrets Manager で RDS に管理させ、state に平文を残さない。
  manage_master_user_password = true

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  parameter_group_name   = aws_db_parameter_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # コスト優先で Single-AZ(ADR-011)。トラフィック増時に Multi-AZ へ。
  multi_az = false

  backup_retention_period    = 7
  auto_minor_version_upgrade = true

  # 公開前は destroy しやすいよう保護を外す。公開時に変数で true / false に変更。
  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : "${local.name_prefix}-db-final"

  tags = {
    Name = "${local.name_prefix}-db"
  }

  # engine_version をメジャーのみ指定しているため、auto_minor_version_upgrade
  # によるマイナー更新を Terraform のドリフトとして検出しないよう無視する。
  lifecycle {
    ignore_changes = [engine_version]
  }
}
