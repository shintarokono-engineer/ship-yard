# variables.tf
# 構成全体で使う入力変数を定義する。default のある変数はそのまま、default の
# 無い変数(domain_name / budget_alert_email)は環境固有値のため apply 時に
# tfvars 等で指定する。

# --- 基本 ---

variable "aws_region" {
  description = "リソースを作成する AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "project" {
  description = "リソース命名・タグの接頭辞に使うプロジェクト名"
  type        = string
  default     = "shipyard"
}

variable "environment" {
  description = "環境名(リソース命名・タグに使用)"
  type        = string
  default     = "prod"
}

# --- ネットワーク ---

variable "vpc_cidr" {
  description = "VPC の CIDR ブロック"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "サブネットを配置するアベイラビリティゾーン。RDS の冗長化に 2 つ以上必要。"
  type        = list(string)
  default     = ["ap-northeast-1a", "ap-northeast-1c"]
}

variable "public_subnet_cidrs" {
  description = "Public Subnet(NAT インスタンス用)の CIDR。azs と同数・同順。"
  type        = list(string)
  default     = ["10.0.0.0/24", "10.0.1.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) == length(var.azs)
    error_message = "public_subnet_cidrs は azs と同数で指定してください。"
  }
}

variable "private_subnet_cidrs" {
  description = "Private Subnet(RDS / App Runner VPC コネクタ用)の CIDR。azs と同数・同順。"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]

  validation {
    condition     = length(var.private_subnet_cidrs) == length(var.azs)
    error_message = "private_subnet_cidrs は azs と同数で指定してください。"
  }
}

variable "nat_instance_type" {
  description = "NAT インスタンスの EC2 タイプ。fck-nat は ARM 対応のため t4g 系が安価。"
  type        = string
  default     = "t4g.nano"
}

variable "nat_ami_id" {
  description = "NAT インスタンスの AMI ID。空なら fck-nat の公開 AMI を data source で解決する。data source が誤った AMI を引く場合に明示指定する。"
  type        = string
  default     = ""
}

# --- RDS(Day 35) ---

variable "db_engine_version" {
  description = "RDS PostgreSQL のメジャーバージョン"
  type        = string
  default     = "16"
}

variable "db_instance_class" {
  description = "RDS インスタンスクラス"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS の初期ストレージ容量(GB)"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "RDS ストレージ自動拡張の上限(GB)"
  type        = number
  default     = 50
}

variable "db_name" {
  description = "作成するデータベース名"
  type        = string
  default     = "shipyard"
}

variable "db_username" {
  description = "RDS マスターユーザー名"
  type        = string
  default     = "shipyard"
}

variable "db_deletion_protection" {
  description = "RDS の削除保護。公開前は false(destroy しやすく)、公開時に true へ。"
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "RDS destroy 時に最終スナップショットを省略するか。公開前は true、公開時に false へ。"
  type        = bool
  default     = true
}

# --- App Runner(Day 36) ---

variable "enable_apprunner_service" {
  description = "App Runner サービスを作成するか。ECR に API イメージが push 済みになってから true にする。"
  type        = bool
  default     = false
}

variable "apprunner_cpu" {
  description = "App Runner の CPU(1024 = 1 vCPU)"
  type        = string
  default     = "1024"

  validation {
    condition     = contains(["256", "512", "1024", "2048", "4096"], var.apprunner_cpu)
    error_message = "apprunner_cpu は 256 / 512 / 1024 / 2048 / 4096 のいずれかで指定してください。"
  }
}

variable "apprunner_memory" {
  description = "App Runner のメモリ(2048 = 2 GB)"
  type        = string
  default     = "2048"

  validation {
    condition     = contains(["512", "1024", "2048", "3072", "4096", "6144", "8192", "10240", "12288"], var.apprunner_memory)
    error_message = "apprunner_memory は App Runner の有効値(512〜12288)で指定してください。"
  }
}

variable "apprunner_image_tag" {
  description = "App Runner がデプロイする ECR イメージのタグ。ECR は IMMUTABLE のため、初回作成時は ECR に push 済みの実在タグ(コミット SHA)を指定する。既定の latest は push されないため、enable_apprunner_service を true にする前に実在タグへ変更すること。"
  type        = string
  default     = "latest"
}

variable "mail_from" {
  description = "メール送信元アドレス(Resend)。独自ドメインのメール DNS(SPF/DKIM/DMARC)設定後に notifications@<domain> 等へ変更する。"
  type        = string
  default     = "Shipyard <onboarding@resend.dev>"
}

# --- ドメイン(Day 37) ---

variable "domain_name" {
  description = "本番ドメイン(例: shipyard.app)。Route53 ホストゾーンを作成する。"
  type        = string
}

# --- 監視・予算(Day 39) ---

variable "monthly_budget_usd" {
  description = "AWS Budgets の月次予算(USD)。50/80/100% で通知する。"
  type        = number
  default     = 50
}

variable "budget_alert_email" {
  description = "予算アラート・CloudWatch アラートの通知先メールアドレス"
  type        = string
}

# --- CI/CD(Day 38) ---

variable "github_repository" {
  description = "GitHub Actions の OIDC 信頼を絞るリポジトリ(owner/repo 形式)"
  type        = string
  default     = "shintarokono-engineer/ship-yard"
}
