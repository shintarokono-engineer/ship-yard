# nat.tf
# Day 36: NAT インスタンスを定義する。Private Subnet(RDS / App Runner VPC
# コネクタ)からの外向き通信を、NAT Gateway より安価な EC2 1 台で中継する
# (ADR-011)。fck-nat の公開 AMI を使う。AMI 解決が誤る場合は nat_ami_id
# 変数で明示指定できる。

# fck-nat の最新 AMI。owner ID / name パターンは apply 前に fck-nat の公式
# ドキュメント(https://github.com/AndrewGuenther/fck-nat)で確認すること。
data "aws_ami" "fck_nat" {
  most_recent = true
  owners      = ["568608671756"]

  filter {
    name   = "name"
    values = ["fck-nat-al2023-*"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

# NAT インスタンスに SSM Session Manager でアクセスするためのロール。
# 障害調査時に SSH 鍵・公開ポートなしでインスタンスへ入れる。
data "aws_iam_policy_document" "nat_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "nat" {
  name_prefix        = "${local.name_prefix}-nat-"
  assume_role_policy = data.aws_iam_policy_document.nat_assume.json
}

resource "aws_iam_role_policy_attachment" "nat_ssm" {
  role       = aws_iam_role.nat.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "nat" {
  name_prefix = "${local.name_prefix}-nat-"
  role        = aws_iam_role.nat.name
}

resource "aws_instance" "nat" {
  ami                         = var.nat_ami_id != "" ? var.nat_ami_id : data.aws_ami.fck_nat.id
  instance_type               = var.nat_instance_type
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.nat.id]
  iam_instance_profile        = aws_iam_instance_profile.nat.name
  associate_public_ip_address = true

  # NAT は自分宛でないパケットを転送するため、送信元/宛先チェックを無効化する。
  source_dest_check = false

  tags = {
    Name = "${local.name_prefix}-nat"
  }
}

# 外向き通信の送信元 IP を固定するため EIP を割り当てる(インスタンス置換でも不変)。
resource "aws_eip" "nat" {
  domain   = "vpc"
  instance = aws_instance.nat.id

  tags = {
    Name = "${local.name_prefix}-nat-eip"
  }
}

# Private Subnet の外向き通信(0.0.0.0/0)を NAT インスタンスへ向ける。
# network.tf の private ルートテーブルに対するルートを Day 36 で追加する。
resource "aws_route" "private_nat" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  network_interface_id   = aws_instance.nat.primary_network_interface_id
}
