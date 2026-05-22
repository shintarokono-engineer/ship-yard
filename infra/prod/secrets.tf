# secrets.tf
# App Runner(API)が runtime で参照するアプリ設定・シークレットを 1 つの
# Secrets Manager シークレットに JSON でまとめる。
#
# 値の実体(API キー・DB 接続文字列等)は apply 後に AWS コンソール / CLI で
# 投入する。Terraform はキー構造のみを管理し、値は ignore_changes で追従しない
# (コード・state に機密を残さない)。

locals {
  # App Runner の runtime_environment_secrets として注入するキー一覧
  # (apps/api/.env.example に対応)。
  app_secret_keys = [
    "DATABASE_URL",
    "CLERK_SECRET_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_PRO",
    "STRIPE_PRICE_TEAM",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "RESEND_API_KEY",
  ]
}

resource "aws_secretsmanager_secret" "app" {
  name_prefix = "${local.name_prefix}-app-config-"
  description = "Shipyard API の runtime シークレット(値は手動投入)"
}

# キー構造を持つプレースホルダ版。App Runner がシークレット参照を解決できるよう
# 全キーを用意する。実値は apply 後に投入し、ignore_changes で上書きしない。
resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({ for k in local.app_secret_keys : k => "REPLACE_ME" })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
