# 本番切替 runbook(AWS + 外部 SaaS の初回構築)

**目的**: ローカルのみで動いている Shipyard を、本番ドメインで一般公開できる状態にするまでの通し手順。
**対象**: 初回の本番構築(2 回目以降のデプロイは GitHub Actions が自動で行う)。
**位置づけ**: AWS インフラ + 外部 SaaS の**通し手順**を扱う。個別テーマの詳細は既存 runbook に委譲する。

| テーマ                       | 参照先                                                                    |
| ---------------------------- | ------------------------------------------------------------------------- |
| Stripe のプラン / Portal 設定 | [`adr-012-release-checklist.md`](./adr-012-release-checklist.md)           |
| 告知配信(ADR-014)の公開確認   | [`adr-014-release-checklist.md`](./adr-014-release-checklist.md)           |
| Clerk webhook のトラブルシュート | [`clerk-webhook-troubleshooting.md`](./clerk-webhook-troubleshooting.md)   |
| コスト構造・削減方針          | [`../infrastructure-cost.md`](../infrastructure-cost.md)                   |
| Terraform の構成             | [`../../infra/README.md`](../../infra/README.md)                          |

---

## 0. 前提

### 必要なもの

- [ ] AWS アカウント(新規作成なら初期クレジットの**実額と有効期限を控える** → §11)
- [ ] AWS 認証情報(`aws configure` 済み、AdministratorAccess 相当)
- [ ] Terraform `>= 1.10`(`.terraform-version` で固定、tfenv 推奨)
- [ ] Docker(API イメージのビルド)
- [ ] ドメインを取得できる状態(クレジットカード)
- [ ] Clerk / Stripe / Resend / Vercel / GitHub の各アカウント

### 所要時間の目安

作業自体は 1〜2 日ですが、**DNS 浸透とドメイン検証の待ち時間**が入るため、**カレンダー上は 2〜3 日**を見てください。

### コストが発生するタイミング

`docs/infrastructure-cost.md` §2.3 の段階表と対応します。**Phase 2 の apply で月 $30 前後が走り始めます。**

| Phase | 累計月額 |
| ----- | -------- |
| 1     | ~$1.5    |
| 2     | ~$32     |
| 7     | ~$38〜42 |
| 公開後(収益化で Vercel Pro) | ~$58〜62 |

---

## 1. Phase 1: ドメイン取得 + state バケット

**ここがクリティカルパス**です。DNS 浸透とドメイン検証(Clerk / Resend)がすべてこの後ろにぶら下がるため、**最初に着手**してください。

- [ ] ドメインを取得する(Route53 でも外部レジストラでもよい)
  - Route53 のドメイン登録料は**初期クレジットの対象外**(§11)
- [ ] state 用 S3 バケットを作成する

```bash
cd infra/bootstrap
terraform init
terraform apply
```

> バケット名はグローバル一意です。`shipyard-tfstate-ap-northeast-1` が取得済みで衝突する場合は、`bootstrap/main.tf` と `prod/backend.tf` の `bucket` を**同じ新しい名前**へ変更します。

---

## 2. Phase 2: prod apply(App Runner を除く)

- [ ] `infra/prod/terraform.tfvars` を作成する(`.gitignore` 済み)

```hcl
domain_name        = "example.app"           # 取得したドメイン
budget_alert_email = "you@example.com"       # 予算・CloudWatch アラートの通知先
# monthly_budget_usd = 60                    # 既定 60。実フロアに対する余裕分
# apprunner_cpu      = "512"                 # 既定 512(0.5 vCPU)
# apprunner_memory   = "1024"                # 既定 1024(1 GB)
```

- [ ] `enable_apprunner_service` は **`false` のまま**にする(ECR にイメージが無いため)
- [ ] apply する

```bash
cd infra/prod
terraform init      # S3 backend へ接続
terraform plan      # 差分を必ず確認する
terraform apply
```

- [ ] 作成されたことを確認する

```bash
terraform output route53_name_servers   # → Phase 3 で使う
terraform output rds_endpoint
terraform output ecr_repository_urls
terraform output github_deploy_role_arn # → Phase 9 で使う
```

> **NAT インスタンスの AMI**:`nat.tf` は fck-nat の公開 AMI を data source で解決します。plan 時に想定外の AMI が出たら `nat_ami_id` で明示指定してください。

---

## 3. Phase 3: DNS 委任 + 外部 SaaS のドメイン検証

**待ち時間が発生する作業をまとめて先に流します。**

- [ ] レジストラのネームサーバーを `terraform output route53_name_servers` の 4 つに変更する
- [ ] 浸透を確認する(数分〜数時間)

```bash
dig NS example.app +short
```

- [ ] **Clerk**:production インスタンスを作成し、指示された CNAME を Route53 に登録する
  - dev インスタンス(`pk_test_...`)とは**別物**です。本番キー(`pk_live_...` / `sk_live_...`)は Phase 5 / 8 で使います
  - Sessions → **Multi-session handling は OFF**(既定)にする(PROJECT_STATUS §9.12.2 F1.5 の前提)
- [ ] **Resend**:送信ドメインを追加し、SPF / DKIM / DMARC の DNS レコードを Route53 に登録 → 検証完了を待つ
  - 検証後に `mail_from` を `Shipyard <noreply@example.app>` 等へ変更し、`terraform apply` で App Runner に反映する

---

## 4. Phase 4: Stripe 本番設定

**詳細は [`adr-012-release-checklist.md`](./adr-012-release-checklist.md) §1 に従ってください。** ここでは通し手順上の位置づけのみ示します。

- [ ] 本番モードで Product / Price を作成(Pro ¥1,480 / Team ¥2,800)→ Price ID を控える
- [ ] Customer Portal を **Activate** する(未設定だと `billingPortal.sessions.create` が 400)
- [ ] Webhook エンドポイント `https://api.example.app/webhooks/stripe` を登録 → 署名シークレット(`whsec_...`)を控える
  - **App Runner がまだ無いのでこの時点では疎通しません**。登録だけ先に行い、疎通確認は Phase 10 で行います

---

## 5. Phase 5: Secrets Manager に実値を投入

Terraform はキー構造だけを管理し、値は手動投入します(state に機密を残さないため)。

- [ ] シークレット ARN を確認する

```bash
aws secretsmanager list-secrets \
  --query "SecretList[?starts_with(Name, 'shipyard-prod-app-config')].[Name,ARN]" --output table
```

- [ ] **10 キーすべて**に実値を入れる(1 つでも `REPLACE_ME` のままだと App Runner が起動しても機能不全になります)

| キー                    | 取得元                                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`          | Phase 6 で組み立てる(RDS エンドポイント + マスターパスワード)         |
| `CLERK_SECRET_KEY`      | Clerk production インスタンス(`sk_live_...`)                          |
| `CLERK_WEBHOOK_SECRET`  | **Phase 8 で取得**(先に空でなく仮値を入れ、Phase 8 で更新する)        |
| `STRIPE_SECRET_KEY`     | Stripe 本番モード(`sk_live_...`)                                      |
| `STRIPE_WEBHOOK_SECRET` | Phase 4 で控えた `whsec_...`                                            |
| `STRIPE_PRICE_PRO`      | Phase 4 で作成した Pro の Price ID                                      |
| `STRIPE_PRICE_TEAM`     | Phase 4 で作成した Team の Price ID                                     |
| `ANTHROPIC_API_KEY`     | Anthropic コンソール                                                    |
| `OPENAI_API_KEY`        | OpenAI コンソール                                                       |
| `RESEND_API_KEY`        | Resend ダッシュボード                                                   |

> `.env.example` にキーを追加したら **`infra/prod/secrets.tf` の `app_secret_keys` も同時に更新**してください。ここが食い違うと本番だけ壊れます(2026-07-25 に `CLERK_WEBHOOK_SECRET` の欠落を修正した経緯があります)。

---

## 6. Phase 6: DB migration の適用

- [ ] RDS のマスターパスワードを取得する

```bash
SECRET_ARN=$(cd infra/prod && terraform output -raw rds_master_secret_arn)
aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" \
  --query SecretString --output text
```

- [ ] `DATABASE_URL` を組み立て、Secrets Manager に投入する(形式: `postgresql://shipyard:<password>@<rds_endpoint>/shipyard?schema=public&sslmode=require`)
- [ ] migration を適用する

> **RDS は Private Subnet にあり、ローカルからは直接繋がりません。** 踏み台(SSM Session Manager 経由のポートフォワード)を使うか、Phase 7 でコンテナを立ててからその中で実行します。NAT インスタンスは SSM 用ロールが付いているのでポートフォワードの起点に使えます。

```bash
# 例: NAT インスタンス経由で RDS へポートフォワード
aws ssm start-session --target "$(cd infra/prod && terraform output -raw nat_instance_id)" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=<rds_endpoint_host>,portNumber=5432,localPortNumber=15432"

# 別ターミナルで
DATABASE_URL="postgresql://shipyard:<password>@localhost:15432/shipyard?schema=public&sslmode=require" \
  pnpm --filter @shipyard/db exec prisma migrate deploy
```

- [ ] **pgvector 拡張**が有効になっていることを確認する(初期 migration `20260508071135_init` の `CREATE EXTENSION` で作成される)

```sql
SELECT extname FROM pg_extension WHERE extname = 'vector';
```

---

## 7. Phase 7: API イメージの push + App Runner 有効化

- [ ] ECR にログインしてイメージを push する(**ECR は IMMUTABLE タグ**なのでコミット SHA を使う)

```bash
AWS_REGION=ap-northeast-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
TAG=$(git rev-parse HEAD)

aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker build -t "$REGISTRY/shipyard/api:$TAG" -f apps/api/Dockerfile .
docker push "$REGISTRY/shipyard/api:$TAG"
```

- [ ] `terraform.tfvars` に反映して apply する

```hcl
enable_apprunner_service = true
apprunner_image_tag      = "<上で push したコミット SHA>"
```

```bash
cd infra/prod && terraform apply
```

- [ ] 起動を確認する

```bash
terraform output apprunner_service_url
curl -i "https://$(terraform output -raw apprunner_service_url)/health"
# → 200 {"status":"ok"}(apps/api/src/app.controller.ts、グローバルプレフィックスなし)
```

- [ ] **メモリ使用率を確認する**(既定を 0.5 vCPU / 1 GB に下げているため)
  - App Runner のメトリクスでメモリ使用率が慢性的に 80% を超える、または OOM で再起動する場合は、`apprunner_cpu = "1024"` / `apprunner_memory = "2048"` に戻して apply する
- [ ] `api.example.app` のカスタムドメインが有効になったことを確認する(証明書検証レコードは Terraform が自動登録)

---

## 8. Phase 8: Clerk webhook の登録

- [ ] Clerk Dashboard → Webhooks → エンドポイント `https://api.example.app/webhooks/clerk` を登録
- [ ] 購読イベント: `user.created` / `user.updated` / `user.deleted`
- [ ] 署名シークレット(Svix)を取得し、Secrets Manager の `CLERK_WEBHOOK_SECRET` を**実値に更新**する
- [ ] App Runner を再デプロイして反映する(シークレットは**起動時に解決**されるため、更新しただけでは反映されません)

```bash
aws apprunner start-deployment --service-arn "$(cd infra/prod && terraform output -raw apprunner_service_arn)"
```

- [ ] Clerk Dashboard の "Send test event" が 2xx を返すことを確認する

> **これが動かないと新規ユーザーの `User` 行が作られず、オンボーディングが 403 で止まります**(PROJECT_STATUS §9.10 の MVP ブロッカー)。詳細な切り分けは [`clerk-webhook-troubleshooting.md`](./clerk-webhook-troubleshooting.md) を参照。

---

## 9. Phase 9: Vercel(Web)の本番設定

- [ ] Vercel プロジェクトの環境変数(Production)を設定する

| 変数                                              | 値                              |
| ------------------------------------------------- | ------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`               | `pk_live_...`                   |
| `CLERK_SECRET_KEY`                                | `sk_live_...`                   |
| `API_URL`                                         | `https://api.example.app`       |
| `SITE_URL`                                        | `https://example.app`           |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` 等 4 つ            | `.env.example` に準拠           |

- [ ] カスタムドメイン `example.app` を Vercel に追加し、指示された A / CNAME レコードを Route53 に登録する
- [ ] **プランは Hobby のまま**(`infrastructure-cost.md` §3.2 C の方針。**初回課金が成立した時点で Pro へ切り替える**)
- [ ] デプロイして `https://example.app` が表示されることを確認する

---

## 10. Phase 10: GitHub Actions(自動デプロイ)の有効化

- [ ] GitHub → Settings → Secrets and variables → Actions に登録する

| 種別     | 名前                    | 値                                                  |
| -------- | ----------------------- | --------------------------------------------------- |
| Secret   | `AWS_DEPLOY_ROLE_ARN`   | `terraform output -raw github_deploy_role_arn`       |
| Secret   | `APPRUNNER_SERVICE_ARN` | `terraform output -raw apprunner_service_arn`        |
| Variable | `AWS_BOOTSTRAPPED`      | `true`                                               |

- [ ] `main` へ push して `deploy.yml` が走ることを確認する
- [ ] 初回デプロイ後、**App Runner の環境変数とシークレットが残っていること**を確認する

```bash
aws apprunner describe-service --service-arn "$(cd infra/prod && terraform output -raw apprunner_service_arn)" \
  --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentSecrets | keys' --output json
# → 10 キーが並ぶこと(空配列なら設定が飛んでいる)
```

> **前提**: `deploy.yml` の App Runner 更新は、`describe-service` で現在の `SourceConfiguration` を取得し、`ImageIdentifier` だけを差し替えて `update-service` に渡す方式です(2026-07-25 に修正)。
> UpdateService の `SourceConfiguration` は**マージではなく置き換え**のため、イメージタグだけを組み立てて渡すと `runtime_environment_variables` / `runtime_environment_secrets` / `authentication_configuration` が消えます(消えると起動はするが DB / Stripe / AI に繋がらない、または ECR pull に失敗する)。ワークフロー側にはシークレットが 0 件なら更新を中止するガードも入っています。
>
> この方式は `apprunner:ListOperations` と App Runner ロールへの `iam:PassRole` を必要とします。いずれも `cicd.tf` に含まれているので、**Phase 2 より前に一度 apply 済みの場合は再度 `terraform apply` して IAM ポリシーを更新してください**。
>
> 万一設定が飛んだ場合は `terraform apply` で戻せます(`image_identifier` は `ignore_changes` 対象なのでタグは維持されます)。

---

## 11. Phase 11: 本番疎通テスト

`docs/acceptance-test-spec.md` のうち **「⚠外部」でローカル検証できなかった項目**をここで消化します。

- [ ] **新規サインアップ** → Clerk webhook で `User` が作られ、`/onboarding` からワークスペースを作成できる
- [ ] 作成直後の状態が **`Tenant.plan = PRO` / `Subscription.status = TRIALING`**(7 日トライアル)
- [ ] **AI 機能**が動く(README 生成 = Haiku、診断 / 検証 = Sonnet + Web Search)
- [ ] **招待メール**が実際に届く(Resend)
- [ ] **Stripe Checkout**(BIL-23): `plan = FREE` の状態から決済完走 → `checkout.session.completed` → `Tenant.plan = PRO`
- [ ] **Stripe Customer Portal** が開く(BIL-12)
- [ ] **公開ページ**が匿名で見られる(`/p/{slug}/{projectId}` と `/p/.../blog/{postSlug}`)
- [ ] `robots.txt` / `sitemap.xml` が返る
- [ ] 告知配信は [`adr-014-release-checklist.md`](./adr-014-release-checklist.md) §4 に従う

---

## 12. Phase 12: 公開前の最終設定

- [ ] RDS の保護を有効化する

```hcl
db_deletion_protection = true
db_skip_final_snapshot = false
```

```bash
cd infra/prod && terraform apply
```

- [ ] SNS の購読確認メール(`budget_alert_email` 宛)を **Confirm** する(未確認だとアラートが届きません)
- [ ] AWS Cost Anomaly Detection(無料)を有効化する
- [ ] **初期クレジットの実額と有効期限を控え、カレンダーに期限日を登録する**
  - AWS Billing コンソール → Credits
  - **AWS Budgets はクレジット適用後の実請求額で判定される**ため、クレジットが残っている間はアラートが鳴りません。クレジットで隠れている本来のコストは Cost Explorer で確認してください(`docs/infrastructure-cost.md` §2.7)
- [ ] クレジットは AWS の請求しか打ち消しません。**ドメイン代と AI 原価(Anthropic / OpenAI)は初月から実費**です

---

## 13. ロールバック / 撤収

### アプリだけ戻す

- [ ] `git revert <commit>` → `main` へ push(`deploy.yml` が前のイメージで再デプロイ)
- [ ] または App Runner を 1 つ前のイメージタグで `update-service`

### インフラを畳む(公開前の検証中のみ)

```bash
cd infra/prod && terraform destroy
```

- 課金リソース(RDS / NAT / App Runner)が消えれば課金は止まります
- `db_deletion_protection = true` にした後は destroy がブロックされます(先に `false` に戻す)
- **公開後は使えません**。データが消えます

### 一時的に費用を止める(検証期間中)

- App Runner を **Pause**(プロビジョニングメモリ課金 $10/月相当が止まる)

---

## 14. よくある詰まりどころ

| 症状                                            | 原因 / 対処                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| App Runner が起動しない                         | Secrets Manager が `REPLACE_ME` のまま / ECR タグが存在しない / インスタンスロールに Secrets 読取権が無い |
| App Runner が起動直後に落ちる                   | メモリ不足の可能性。`apprunner_memory` を `2048` に戻す(§7)                                     |
| API から外部 API に出られない                   | NAT インスタンスまたは Private Subnet のルートを確認。VPC Flow Logs(`REJECT`)に拒否が出ていないか |
| `POST /webhooks/clerk` が 500                   | `CLERK_WEBHOOK_SECRET` 未設定 / 更新後に再デプロイしていない(§8)                                 |
| Stripe Portal が 400                            | Customer Portal が Activate されていない(§4)                                                    |
| 予算アラートが毎月鳴る / 全く鳴らない           | 閾値が固定フロアと不整合 / クレジット期間中で実請求が 0(§12)                                    |
| `terraform apply` で NAT の AMI が見つからない  | `nat_ami_id` を明示指定する(§2)                                                                 |

---

## 関連リンク

- [`../infrastructure-cost.md`](../infrastructure-cost.md) — コスト構造・削減方針・クレジットの実態
- [`../../infra/README.md`](../../infra/README.md) — Terraform の構成とリソース一覧
- [`adr-012-release-checklist.md`](./adr-012-release-checklist.md) — Stripe / プラン構造
- [`adr-014-release-checklist.md`](./adr-014-release-checklist.md) — 告知配信
- [`clerk-webhook-troubleshooting.md`](./clerk-webhook-troubleshooting.md) — Clerk webhook
- [`../../docs/adr/010-iac-tool.md`](../adr/010-iac-tool.md) / [`011-lightweight-aws-architecture.md`](../adr/011-lightweight-aws-architecture.md)
