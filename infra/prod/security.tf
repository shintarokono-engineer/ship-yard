# security.tf
# Security Group(NAT インスタンス / App Runner VPC コネクタ / RDS)を定義する。
# App Runner → RDS、App Runner → NAT → 外部 API という通信経路を表現する。
#
# Security Group は本体(name_prefix / description / vpc)と rule を分離して
# 定義する。個別の aws_vpc_security_group_*_rule は inline ルールより差分が
# 追いやすく、AWS provider 5.x で推奨される方式。
# name_prefix + create_before_destroy: ルール変更で SG 置換が要る場合も、新規
# 作成 → 参照切替 → 旧削除の順にし、同名衝突・参照中削除エラーを避ける。

# --- NAT インスタンス: Private Subnet からの全通信を受けて外部へ転送する ---
resource "aws_security_group" "nat" {
  name_prefix = "${local.name_prefix}-nat-"
  description = "NAT instance: forward outbound traffic from private subnets"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-nat-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "nat_from_vpc" {
  security_group_id = aws_security_group.nat.id
  description       = "All traffic from within the VPC"
  cidr_ipv4         = var.vpc_cidr
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_egress_rule" "nat_all" {
  security_group_id = aws_security_group.nat.id
  description       = "All outbound to the internet"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --- App Runner VPC コネクタ: RDS への接続と NAT 経由の外部通信を行う ---
# 受信は不要(App Runner のインバウンドはマネージドな公開 HTTPS、SG 管理外)。
# 戻りパケットは SG のステートフル動作で許可されるため ingress ルールは持たない。
resource "aws_security_group" "apprunner" {
  name_prefix = "${local.name_prefix}-apprunner-"
  description = "App Runner VPC connector: outbound to RDS and internet via NAT"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-apprunner-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "apprunner_all" {
  security_group_id = aws_security_group.apprunner.id
  description       = "All outbound (RDS / Anthropic / OpenAI / Stripe / Clerk / Resend via NAT)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --- RDS(PostgreSQL): App Runner VPC コネクタからの 5432 接続のみ ---
resource "aws_security_group" "rds" {
  name_prefix = "${local.name_prefix}-rds-"
  description = "RDS PostgreSQL: allow 5432 from App Runner VPC connector only"
  vpc_id      = aws_vpc.main.id

  # egress は定義しない(DB は能動的な外向き通信を行わないため最小権限)。
  tags = {
    Name = "${local.name_prefix}-rds-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_apprunner" {
  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL from App Runner VPC connector"
  referenced_security_group_id = aws_security_group.apprunner.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

# 管理アクセス用の一時ルール(enable_admin_db_access = true のときだけ作成)。
#
# RDS は Private Subnet にあり手元から直接繋がらないため、migration 適用や調査では
# SSM ポートフォワード(踏み台 = NAT インスタンス)を使う。その接続元は NAT インスタンス
# なので、上の App Runner 限定ルールだけでは弾かれる。
#
# NAT インスタンスは SSH ポートを開けておらず、到達手段は SSM(IAM 認証 + CloudTrail 監査)
# のみ。それでも DB への経路を常時開ける必要は無いため、既定 false で作業時だけ開ける。
# 作業後は false に戻して apply すること(docs/runbooks/production-cutover.md Phase 6)。
resource "aws_vpc_security_group_ingress_rule" "rds_from_nat_admin" {
  count = var.enable_admin_db_access ? 1 : 0

  security_group_id            = aws_security_group.rds.id
  description                  = "TEMPORARY: PostgreSQL from NAT instance for admin access via SSM port forwarding"
  referenced_security_group_id = aws_security_group.nat.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}
