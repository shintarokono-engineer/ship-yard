# variables.tf
# 構成全体で使う入力変数(リージョン・プロジェクト名・CIDR・AZ)を定義する。

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

variable "vpc_cidr" {
  description = "VPC の CIDR ブロック"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "サブネットを配置するアベイラビリティゾーン。ALB / Aurora の冗長化に 2 つ以上必要。"
  type        = list(string)
  default     = ["ap-northeast-1a", "ap-northeast-1c"]
}

variable "public_subnet_cidrs" {
  description = "Public Subnet(ALB 用)の CIDR。azs と同数・同順。"
  type        = list(string)
  default     = ["10.0.0.0/24", "10.0.1.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) == length(var.azs)
    error_message = "public_subnet_cidrs は azs と同数で指定してください。"
  }
}

variable "private_subnet_cidrs" {
  description = "Private Subnet(Aurora / ElastiCache 用)の CIDR。azs と同数・同順。"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]

  validation {
    condition     = length(var.private_subnet_cidrs) == length(var.azs)
    error_message = "private_subnet_cidrs は azs と同数で指定してください。"
  }
}
