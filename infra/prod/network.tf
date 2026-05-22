# network.tf
# ネットワーク基盤: VPC / Subnet(Public・Private ×2AZ)/ IGW / Route Table を
# 定義する。VPC デフォルト SG はルール無しで宣言して無害化する。
#
# 構成は軽量 AWS(ADR-011): API は App Runner、DB は Private Subnet の RDS。
# App Runner は VPC コネクタ経由で RDS に接続し、外部 API へは NAT 経由で出る。
# NAT は安価な NAT インスタンス(Day 36 で作成)。Public Subnet には NAT
# インスタンスを、Private Subnet には RDS と VPC コネクタを配置する。

resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr

  # RDS のエンドポイント名前解決に DNS ホスト名が必要。
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${local.name_prefix}-vpc"
  }
}

# VPC デフォルト SG は「自分自身からの全許可」ルールを持つ。ルール無しで宣言して
# 空にし、誤って使われても無害化する(CIS ベンチマーク準拠)。
resource "aws_default_security_group" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-default-sg-do-not-use"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-igw"
  }
}

# Public Subnet: NAT インスタンス(Day 36 で作成)を配置する。
resource "aws_subnet" "public" {
  count = length(var.azs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${local.name_prefix}-public-${var.azs[count.index]}"
    Tier = "public"
  }
}

# Private Subnet: RDS と App Runner VPC コネクタを配置する。外部との通信は
# NAT インスタンス経由に限定する。
resource "aws_subnet" "private" {
  count = length(var.azs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.azs[count.index]

  tags = {
    Name = "${local.name_prefix}-private-${var.azs[count.index]}"
    Tier = "private"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${local.name_prefix}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count = length(var.azs)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private Subnet 用ルートテーブル。NAT インスタンス向けの 0.0.0.0/0 ルートは
# NAT インスタンスを作成する Day 36 で追加する。現時点では VPC 内部通信のみ。
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-private-rt"
  }
}

resource "aws_route_table_association" "private" {
  count = length(var.azs)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
