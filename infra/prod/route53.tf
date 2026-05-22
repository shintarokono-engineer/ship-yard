# route53.tf
# Day 37: 本番ドメインの Route53 ホストゾーンと、API サブドメインの App Runner
# カスタムドメイン関連付けを定義する。
#
# TLS 証明書は App Runner / Vercel がそれぞれ自前で管理するため、本ファイルで
# ACM 証明書を明示的に発行する必要はない。Web(Vercel)用の apex / www レコード
# は Vercel が提示する値を別途登録する(本ファイルの管理外)。

resource "aws_route53_zone" "main" {
  name = var.domain_name

  tags = {
    Name = "${local.name_prefix}-zone"
  }
}

# API サブドメイン(api.<domain>)を App Runner サービスに関連付ける。
# App Runner が TLS 証明書を管理し、検証用 DNS レコードと CNAME ターゲットを返す。
resource "aws_apprunner_custom_domain_association" "api" {
  count = var.enable_apprunner_service ? 1 : 0

  domain_name          = "api.${var.domain_name}"
  service_arn          = aws_apprunner_service.api[0].arn
  enable_www_subdomain = false
}

# api.<domain> を App Runner のドメインターゲットへ向ける CNAME。
resource "aws_route53_record" "api" {
  count = var.enable_apprunner_service ? 1 : 0

  zone_id = aws_route53_zone.main.zone_id
  name    = "api.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = [aws_apprunner_custom_domain_association.api[0].dns_target]
}

# App Runner が要求する TLS 証明書の検証用 DNS レコード。
resource "aws_route53_record" "apprunner_cert_validation" {
  for_each = {
    for r in try(aws_apprunner_custom_domain_association.api[0].certificate_validation_records, []) :
    r.name => r
  }

  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 300
  records = [each.value.value]
}
