# 本番切替 runbook(AWS + 外部 SaaS の初回構築)

**目的**: ローカルのみで動いている Shipyard を、本番ドメインで一般公開できる状態にするまでの通し手順。
**対象**: 初回の本番構築(2 回目以降のデプロイは GitHub Actions が自動で行う)。
**方針**: **このファイルだけを上から実行すれば完了できる**ように書く。他ドキュメントは補足・トラブル時の深掘り用。

> コンソールの画面名・メニュー階層は各サービスの UI 更新で変わることがあります。ここに書いた値(ドメイン・イベント名・キー名)は変わりませんが、**たどり方が違ったらダッシュボードの表示を優先**してください。

---

## 進行表

| Phase | 内容                              | 実作業  | 待ち時間      | 累計コスト/月 |
| ----- | --------------------------------- | ------- | ------------- | ------------- |
| 0     | 事前準備(アカウント・ツール)      | 30 分   | —             | $0            |
| 1     | ドメイン取得 + state バケット     | 30 分   | **〜数時間**  | ~$1.5         |
| 2     | `prod` apply(App Runner 除く)     | 15 分   | 〜15 分(RDS)  | ~$32          |
| 3     | DNS 委任 + Clerk / Resend 検証    | 40 分   | **〜数時間**  | ~$32          |
| 4     | Stripe 本番設定                   | 30 分   | —             | ~$32          |
| 5     | Secrets Manager 投入              | 20 分   | —             | ~$32          |
| 6     | DB migration                      | 20 分   | —             | ~$32          |
| 7     | ECR push + App Runner 有効化      | 30 分   | 〜10 分       | ~$38〜42      |
| 8     | Clerk webhook 登録                | 15 分   | —             | ~$38〜42      |
| 9     | Vercel 本番設定                   | 20 分   | 〜30 分(DNS)  | ~$38〜42      |
| 10    | GitHub Actions 有効化             | 15 分   | —             | ~$38〜42      |
| 11    | 本番疎通テスト                    | 1〜2 h  | —             | ~$38〜42      |
| 12    | 公開前の最終設定                  | 20 分   | —             | ~$38〜42      |

**待ち時間があるのは Phase 1 と 3(DNS)です。ここを最初に着手し、待っている間に他の作業を進めてください。**

コストの内訳は [`../infrastructure-cost.md`](../infrastructure-cost.md) §2.3 / §2.4 を参照。**Phase 2 の apply から月 $30 前後が発生します。**

---

## Phase 0: 事前準備

### 0.1 アカウント

- [ ] **AWS アカウント**(新規作成する場合)
  - 作成後、Billing コンソール → **Credits** で初期クレジットの**実額と有効期限を控える**(Phase 12 で使う)
- [ ] Clerk / Stripe / Resend / Vercel / GitHub / Anthropic / OpenAI の各アカウント

### 0.2 ローカルツール

```bash
# Terraform(.terraform-version で固定。tfenv 推奨)
tfenv install && tfenv use
terraform version        # >= 1.10

# AWS CLI + 認証情報
aws configure            # AdministratorAccess 相当のユーザー / SSO
aws sts get-caller-identity

# SSM Session Manager プラグイン(Phase 6 の DB 接続で使う)
#   macOS: brew install --cask session-manager-plugin
session-manager-plugin --version

# その他
docker version
jq --version
gh auth status           # Phase 10 で使う(任意)
```

### 0.3 用語の置き換え

以降 `example.app` と書いてある箇所は、**Phase 1 で取得した実際のドメイン**に読み替えてください。

---

## Phase 1: ドメイン取得 + state バケット

**ここがクリティカルパス**です。Clerk / Resend のドメイン検証、Stripe / Clerk の Webhook URL、Vercel のカスタムドメインがすべてこの後ろに連なります。

### 1.1 ドメインを取得する

**方法 A: Route53 で登録する(DNS 管理が一体化して楽)**

1. AWS コンソール → **Route 53** → 「ドメインの登録」
2. 希望ドメインを検索 → カートに追加 → 連絡先情報を入力
3. 「プライバシー保護」は有効のまま(既定)
4. 登録完了まで **10 分〜数時間**(TLD による)
5. 登録が完了すると**ホストゾーンが自動作成される**

> ⚠ この場合、Terraform の `aws_route53_zone.main` と**ホストゾーンが二重に作られます**。1.3 の手順で import するか、自動作成された方を削除してください。

**方法 B: 外部レジストラ(お名前.com / Cloudflare 等)で取得する**

- ドメインだけ取得し、DNS は Route53 に委任する(Phase 3.1)
- Terraform がホストゾーンを作るので二重管理にならない。**こちらのほうが手順は素直**です

- [ ] ドメインを取得した

> **費用**: `.app` なら年 $14〜20 程度。**Route53 のドメイン登録料は AWS 初期クレジットの対象外**です。

### 1.2 state バケットを作成する

`prod/` の state は S3 に置きますが、その S3 自体をまず作ります(ローカル state で 1 度だけ)。

```bash
cd infra/bootstrap
terraform init
terraform apply     # yes を入力
```

- [ ] S3 バケットが作成された

> バケット名はグローバル一意です。`shipyard-tfstate-ap-northeast-1` が取得済みで衝突する場合は、`bootstrap/main.tf` と `prod/backend.tf` の `bucket` を**同じ新しい名前**へ変更してから再実行します。

### 1.3 (方法 A を選んだ場合のみ)ホストゾーンの二重作成を回避する

```bash
# 自動作成されたホストゾーン ID を確認
aws route53 list-hosted-zones-by-name --dns-name example.app \
  --query 'HostedZones[0].[Id,Name]' --output text
```

Phase 2 の apply 前に、そのゾーンを Terraform に取り込みます。

```bash
cd infra/prod
terraform init
terraform import aws_route53_zone.main <ZONE_ID の末尾部分>   # 例: Z0123456789ABCDEFGHIJ
```

- [ ] import 済み、または自動作成ゾーンを削除した

---

## Phase 2: prod apply(App Runner を除く)

### 2.1 変数ファイルを作る

`infra/prod/terraform.tfvars` を新規作成します(`.gitignore` 済みなのでコミットされません)。

```hcl
# 必須(default が無い変数)
domain_name        = "example.app"
budget_alert_email = "you@example.com"

# 任意(既定値のままで良ければ書かなくてよい)
# monthly_budget_usd = 60      # 実フロア $36〜40 に対する余裕分
# apprunner_cpu      = "512"   # 0.5 vCPU
# apprunner_memory   = "1024"  # 1 GB
# nat_ami_id         = ""      # fck-nat の AMI を明示指定したい場合
```

- [ ] `enable_apprunner_service` は **書かない**(既定 `false`)。ECR にイメージが無い状態では作れません

### 2.2 apply する

```bash
cd infra/prod
terraform init          # S3 backend へ接続
terraform plan          # 差分を必ず目視する
terraform apply         # RDS 作成があるので 10〜15 分かかる
```

plan で確認すべき点:

- [ ] `aws_db_instance.main` の `instance_class` が `db.t4g.micro`、`multi_az = false`
- [ ] `aws_instance.nat` の AMI が fck-nat のもの(想定外なら `nat_ami_id` で明示指定)
- [ ] `aws_apprunner_service` が **含まれていない**(この段階では正しい)

### 2.3 出力を控える

```bash
terraform output route53_name_servers      # → Phase 3.1
terraform output -raw rds_endpoint         # → Phase 5 / 6
terraform output ecr_repository_urls       # → Phase 7
terraform output -raw github_deploy_role_arn   # → Phase 10
terraform output -raw route53_zone_id      # → Phase 3 で DNS を足すのに使う
```

- [ ] apply 完了、出力を控えた

> **この時点から月 $30 前後の課金が始まります。** 検証が長引く場合は、公開直前まで `terraform destroy` で畳んでおく運用も可能です(§13)。

### 2.4 DNS レコードを追加するための下準備

以降の Phase で「Route53 にレコードを追加」が何度も出てきます。毎回コンソールを開いてもよいですが、CLI なら次のヘルパーが使えます。

```bash
# infra/prod で実行する前提
ZONE_ID=$(terraform output -raw route53_zone_id)

add_record() {   # 使い方: add_record <name> <type> <value> [ttl]
  aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" \
    --change-batch "$(jq -n --arg n "$1" --arg t "$2" --arg v "$3" --argjson ttl "${4:-300}" '
      {Changes:[{Action:"UPSERT",ResourceRecordSet:{Name:$n,Type:$t,TTL:$ttl,ResourceRecords:[{Value:$v}]}}]}')"
}

# 例: add_record "clerk.example.app" CNAME "frontend-api.clerk.services"
# 例(TXT は値を二重引用符で囲む): add_record "send.example.app" TXT '"v=spf1 include:amazonses.com ~all"'
```

---

## Phase 3: DNS 委任 + Clerk / Resend のドメイン検証

**待ちが発生する作業をまとめて先に流します。**

### 3.1 ネームサーバーを Route53 に向ける

方法 A(Route53 でドメイン登録)を選んだ場合はこの手順は不要です。方法 B の場合:

1. `terraform output route53_name_servers` の 4 件を控える
2. レジストラの管理画面 → ネームサーバー設定 → 上記 4 件に変更

```bash
# 浸透確認(反映まで数分〜数時間)
dig NS example.app +short
```

- [ ] `dig` の結果が Route53 のネームサーバーになった

### 3.2 Clerk の production インスタンスを作る

開発中に使ってきたインスタンス(`pk_test_...`)とは**別物**です。本番用を新たに用意します。

1. Clerk Dashboard → 対象アプリケーション → 上部の環境セレクタ → **Production を作成**(「Create production instance」/「Deploy to production」等)
2. 本番ドメインに `example.app` を入力
3. Clerk が **DNS レコード(CNAME)一覧**を表示するので、すべて Route53 に登録する
   - 例: `clerk` / `accounts` / `clkmail` / `clk._domainkey` / `clk2._domainkey`
   - **実際の値は必ずダッシュボードの表示をコピー**してください

```bash
# 2.4 のヘルパーを使う例
add_record "clerk.example.app"          CNAME "<Clerk が表示した値>"
add_record "accounts.example.app"       CNAME "<Clerk が表示した値>"
add_record "clkmail.example.app"        CNAME "<Clerk が表示した値>"
add_record "clk._domainkey.example.app" CNAME "<Clerk が表示した値>"
add_record "clk2._domainkey.example.app" CNAME "<Clerk が表示した値>"
```

4. Clerk の画面で **Verify** を押し、全レコードが緑になるまで待つ(数分〜数時間)
5. **API Keys** から本番キーを控える → `pk_live_...` / `sk_live_...`
6. **Sessions** → **Multi-session handling を OFF**(既定)にする
   - ON だとサインアウト後にリロードで自動再ログインする問題が起きます(PROJECT_STATUS §9.12.2 F1.5)
7. **Sign-in / Sign-up** の設定(ソーシャルログイン等)を dev インスタンスと揃える
   - production インスタンスでは Google 等の OAuth に**自前の Client ID / Secret が必要**になる場合があります(Clerk の共有クレデンシャルは開発用)

- [ ] ドメイン検証が完了し、`pk_live_...` / `sk_live_...` を控えた

### 3.3 Resend の送信ドメインを検証する

1. Resend Dashboard → **Domains** → **Add Domain** → `example.app`(またはサブドメイン)
2. 表示された DNS レコード(MX / TXT-SPF / TXT-DKIM)を Route53 に登録する
   - 例: `send.example.app` の MX、`send.example.app` の SPF TXT、`resend._domainkey.example.app` の DKIM TXT
   - **実際の値はダッシュボードの表示をコピー**してください
3. **Verify** を押し、`Verified` になるまで待つ(数分〜数時間)
4. **API Keys** から `re_...` を発行して控える

検証完了後、送信元アドレスを独自ドメインに切り替えます。

```hcl
# infra/prod/terraform.tfvars に追記
mail_from = "Shipyard <noreply@example.app>"
```

```bash
cd infra/prod && terraform apply    # App Runner 未作成の段階では差分なし。Phase 7 以降で反映される
```

- [ ] Resend が `Verified` になり、`re_...` を控えた

---

## Phase 4: Stripe 本番設定

詳細な背景は [`adr-012-release-checklist.md`](./adr-012-release-checklist.md) にありますが、**ここだけで完了できるよう手順を記載**します。

### 4.1 本番モードに切り替える

Stripe Dashboard 右上の **「テスト環境」トグルをオフ**にします。以降の作業はすべて本番モードで行ってください(テストモードで作った Price ID は本番では使えません)。

- [ ] 本番モードになっている
- [ ] 本番モードの有効化(事業者情報・銀行口座の登録)が完了している

### 4.2 Product / Price を作成する

**Pro プラン**

1. 商品カタログ → **商品を追加**
2. 名前: `Shipyard Pro`
3. 料金: **¥1,480** / **月次** / **継続**(通貨 JPY)
4. 保存 → 作成された **Price ID(`price_...`)を控える** → `STRIPE_PRICE_PRO`

**Team プラン**

1. 商品カタログ → **商品を追加**
2. 名前: `Shipyard Team`
3. 料金: **¥2,800** / **月次** / **継続**(通貨 JPY)
   - 人数課金は Checkout / Subscription 側で `quantity` を渡して実現します(ADR-004)。Price 側で段階制などを設定する必要はありません
4. 保存 → **Price ID を控える** → `STRIPE_PRICE_TEAM`

- [ ] Price ID を 2 つ控えた

### 4.3 Customer Portal を有効化する

設定 → 請求 → **カスタマーポータル**

- [ ] **有効化(Activate)** する ← これを忘れると `POST /workspaces/:slug/portal-session` が 400 になります
- [ ] 支払い方法の追加・更新を**許可**
- [ ] サブスクリプションの**キャンセルを許可**
- [ ] **プラン変更を許可**し、変更先商品に **Pro と Team を登録**

### 4.4 Webhook エンドポイントを登録する

開発者 → **Webhook** → **エンドポイントを追加**

- URL: `https://api.example.app/webhooks/stripe`
- 送信するイベント(**6 種、`stripe-webhook.service.ts` が処理するもの**):

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

- [ ] 作成後、**署名シークレット(`whsec_...`)を控える** → `STRIPE_WEBHOOK_SECRET`

> App Runner がまだ無いのでこの時点では疎通しません。登録だけ先に行い、実際の到達確認は Phase 11 で行います。

### 4.5 API キーを控える

開発者 → API キー → **シークレットキー(`sk_live_...`)** → `STRIPE_SECRET_KEY`

- [ ] 控えた

---

## Phase 5: Secrets Manager に実値を投入

Terraform はキー構造だけを管理し、値は手動投入します(state に機密を残さないため)。

### 5.1 シークレットの ARN を確認する

```bash
SECRET_ARN=$(aws secretsmanager list-secrets \
  --query "SecretList[?starts_with(Name, 'shipyard-prod-app-config')].ARN | [0]" --output text)
echo "$SECRET_ARN"
```

### 5.2 10 キーすべてに値を入れる

**1 つでも `REPLACE_ME` のままだと、起動はしても該当機能が壊れます。**

| キー                    | 値の取得元                                                        |
| ----------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`          | **Phase 6.1 で組み立てる**(ここでは仮値でよい)                   |
| `CLERK_SECRET_KEY`      | Phase 3.2 の `sk_live_...`                                         |
| `CLERK_WEBHOOK_SECRET`  | **Phase 8 で取得**(ここでは仮値でよい)                           |
| `STRIPE_SECRET_KEY`     | Phase 4.5 の `sk_live_...`                                         |
| `STRIPE_WEBHOOK_SECRET` | Phase 4.4 の `whsec_...`                                           |
| `STRIPE_PRICE_PRO`      | Phase 4.2 の `price_...`                                           |
| `STRIPE_PRICE_TEAM`     | Phase 4.2 の `price_...`                                           |
| `ANTHROPIC_API_KEY`     | https://console.anthropic.com                                      |
| `OPENAI_API_KEY`        | https://platform.openai.com/api-keys(要事前チャージ)             |
| `RESEND_API_KEY`        | Phase 3.3 の `re_...`                                              |

ローカルに一時ファイルを作って一括投入します(**投入後に必ず削除**)。

```bash
cd "$(mktemp -d)"
cat > secret.json <<'JSON'
{
  "DATABASE_URL": "postgresql://shipyard:PASSWORD@ENDPOINT/shipyard?schema=public&sslmode=require",
  "CLERK_SECRET_KEY": "sk_live_...",
  "CLERK_WEBHOOK_SECRET": "whsec_PLACEHOLDER",
  "STRIPE_SECRET_KEY": "sk_live_...",
  "STRIPE_WEBHOOK_SECRET": "whsec_...",
  "STRIPE_PRICE_PRO": "price_...",
  "STRIPE_PRICE_TEAM": "price_...",
  "ANTHROPIC_API_KEY": "sk-ant-...",
  "OPENAI_API_KEY": "sk-proj-...",
  "RESEND_API_KEY": "re_..."
}
JSON

aws secretsmanager put-secret-value --secret-id "$SECRET_ARN" \
  --secret-string file://secret.json

rm -f secret.json && cd -
```

### 5.3 投入結果を確認する(キー名だけ)

```bash
aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" \
  --query SecretString --output text | jq 'keys'
# → 10 キーが並ぶこと
```

- [ ] 10 キーすべてに実値(または Phase 6 / 8 で埋める仮値)が入った

> **`apps/api/.env.example` にキーを追加したら、`infra/prod/secrets.tf` の `app_secret_keys` も必ず同時に更新**してください。ここが食い違うと本番だけ壊れます(2026-07-25 に `CLERK_WEBHOOK_SECRET` の欠落を修正した経緯があります)。

---

## Phase 6: DB migration の適用

RDS は Private Subnet にあり、ローカルから直接は繋がりません。**NAT インスタンス経由で SSM ポートフォワード**して適用します。

### 6.1 接続情報を組み立てる

```bash
cd infra/prod
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)   # host:port 形式
RDS_HOST=${RDS_ENDPOINT%%:*}
NAT_ID=$(terraform output -raw nat_instance_id)

# マスターパスワード(RDS が Secrets Manager で管理している)
MASTER_SECRET=$(terraform output -raw rds_master_secret_arn)
DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id "$MASTER_SECRET" \
  --query SecretString --output text | jq -r '.password')

echo "host=$RDS_HOST"
```

### 6.2 ポートフォワードを張る

```bash
aws ssm start-session --target "$NAT_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$RDS_HOST,portNumber=5432,localPortNumber=15432"
# このターミナルは開いたままにする
```

> 繋がらない場合: NAT インスタンスに SSM エージェントが起動しているか(`nat.tf` で SSM ロールは付与済み)、Private Subnet の RDS SG が NAT からの 5432 を許可しているかを確認します。

### 6.3 migration を適用する

**別ターミナル**で実行します。

```bash
cd /path/to/ship-yard
DATABASE_URL="postgresql://shipyard:<DB_PASSWORD>@localhost:15432/shipyard?schema=public&sslmode=require" \
  pnpm --filter @shipyard/db exec prisma migrate deploy
```

- [ ] すべての migration が適用された

### 6.4 確認する

```bash
DATABASE_URL="postgresql://shipyard:<DB_PASSWORD>@localhost:15432/shipyard?schema=public&sslmode=require" \
  pnpm --filter @shipyard/db exec prisma migrate status
```

pgvector とテーブルの確認(`psql` があれば):

```sql
SELECT extname FROM pg_extension WHERE extname = 'vector';   -- → vector
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
```

- [ ] pgvector 拡張が有効(初期 migration `20260508071135_init` で作成される)

### 6.5 `DATABASE_URL` を Secrets Manager に確定投入する

Phase 5 で仮値にしていた場合、ここで実値に更新します(**ホストは RDS のエンドポイント**、localhost ではありません)。

```
postgresql://shipyard:<DB_PASSWORD>@<RDS_HOST>:5432/shipyard?schema=public&sslmode=require
```

- [ ] 更新した

---

## Phase 7: API イメージの push + App Runner 有効化

### 7.1 イメージをビルドして push する

> ⚠ **Apple Silicon (M1/M2/M3) で作業している場合は `--platform linux/amd64` が必須**です。App Runner は x86_64 のみ対応で、arm64 イメージを push すると起動時に `exec format error` で失敗します。

```bash
cd /path/to/ship-yard

AWS_REGION=ap-northeast-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
TAG=$(git rev-parse HEAD)
IMAGE="$REGISTRY/shipyard/api:$TAG"

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

docker buildx build --platform linux/amd64 \
  -t "$IMAGE" -f apps/api/Dockerfile . --push

echo "$IMAGE"
```

- [ ] push できた(`aws ecr list-images --repository-name shipyard/api` で確認)

> ECR は **IMMUTABLE タグ**なので、同じタグの push はできません。やり直すときは新しいコミット SHA を使うか、タグに `-2` 等を足します。

### 7.2 App Runner を有効化する

```hcl
# infra/prod/terraform.tfvars に追記
enable_apprunner_service = true
apprunner_image_tag      = "<7.1 の TAG>"
```

```bash
cd infra/prod
terraform plan     # App Runner サービス + VPC コネクタ + カスタムドメイン関連付けが出る
terraform apply    # 5〜10 分
```

### 7.3 起動を確認する

```bash
SERVICE_URL=$(terraform output -raw apprunner_service_url)
curl -i "https://$SERVICE_URL/health"
# → 200 {"status":"ok"}(apps/api/src/app.controller.ts、グローバルプレフィックスなし)
```

失敗する場合:

```bash
# サービスの状態
aws apprunner describe-service --service-arn "$(terraform output -raw apprunner_service_arn)" \
  --query 'Service.Status'

# アプリケーションログ(CloudWatch Logs)
aws logs tail "/aws/apprunner/shipyard-prod-api/$(aws apprunner describe-service \
  --service-arn "$(terraform output -raw apprunner_service_arn)" \
  --query 'Service.ServiceId' --output text)/application" --follow
```

- [ ] `/health` が 200 を返した

### 7.4 メモリ使用率を確認する

既定を **0.5 vCPU / 1 GB** に下げているため、初回デプロイ後に確認します。

- [ ] App Runner のメトリクスでメモリ使用率が慢性的に 80% を超えていない
- [ ] OOM による再起動が発生していない

超えている場合は戻します。

```hcl
apprunner_cpu    = "1024"
apprunner_memory = "2048"
```

### 7.5 カスタムドメインを確認する

`api.example.app` の関連付けと証明書検証レコードは Terraform が自動登録します。

```bash
curl -i "https://api.example.app/health"    # 反映まで数分〜数十分
```

- [ ] `api.example.app` で 200 が返った

---

## Phase 8: Clerk webhook の登録

**これが動かないと新規ユーザーの `User` 行が作られず、オンボーディングが 403 で止まります**(PROJECT_STATUS §9.10 の MVP ブロッカー)。

1. Clerk Dashboard(**Production インスタンス**)→ **Webhooks** → **Add Endpoint**
2. URL: `https://api.example.app/webhooks/clerk`
3. 購読イベント(**3 種、`clerk-webhook.service.ts` が処理するもの**):

```
user.created
user.updated
user.deleted
```

4. 作成後に表示される **Signing Secret(`whsec_...`)** を控える
5. Secrets Manager の `CLERK_WEBHOOK_SECRET` を実値に更新する

```bash
CURRENT=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)
UPDATED=$(printf '%s' "$CURRENT" | jq --arg v 'whsec_...' '.CLERK_WEBHOOK_SECRET = $v')
aws secretsmanager put-secret-value --secret-id "$SECRET_ARN" --secret-string "$UPDATED"
```

6. **App Runner を再デプロイする**(シークレットは**起動時に解決**されるため、更新しただけでは反映されません)

```bash
aws apprunner start-deployment \
  --service-arn "$(cd infra/prod && terraform output -raw apprunner_service_arn)"
```

7. Clerk Dashboard の **Send test event** が **2xx** を返すことを確認

- [ ] テストイベントが 2xx

> 切り分けは [`clerk-webhook-troubleshooting.md`](./clerk-webhook-troubleshooting.md) を参照。

---

## Phase 9: Vercel(Web)の本番設定

### 9.1 環境変数(Production)を設定する

Vercel → プロジェクト → Settings → **Environment Variables**(対象は **Production**)

| 変数                                              | 値                          |
| ------------------------------------------------- | --------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`               | `pk_live_...`(Phase 3.2)  |
| `CLERK_SECRET_KEY`                                | `sk_live_...`(Phase 3.2)  |
| `API_URL`                                         | `https://api.example.app`   |
| `SITE_URL`                                        | `https://example.app`       |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`                   | `/sign-in`                  |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`                   | `/sign-up`                  |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/`                         |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/`                         |

- [ ] 8 変数を設定した

### 9.2 カスタムドメインを設定する

1. Vercel → Settings → **Domains** → `example.app` を追加
2. Vercel が提示する DNS レコードを Route53 に登録する
   - apex(`example.app`)は **A レコード**、`www` は **CNAME** が一般的。**表示された値をそのまま**使ってください

```bash
# 2.4 のヘルパーを使う例
add_record "example.app"     A     "<Vercel が表示した IP>"
add_record "www.example.app" CNAME "<Vercel が表示した値>"
```

3. Vercel の画面でドメインが **Valid** になるまで待つ

- [ ] `https://example.app` が表示された

### 9.3 プランは Hobby のまま

[`../infrastructure-cost.md`](../infrastructure-cost.md) §3.2 C の方針により、**公開時点では Hobby を継続**します。**初回課金が成立した時点で Pro へ切り替える**(ダッシュボード操作で即時反映、再デプロイ・DNS 変更は不要)。

- [ ] Hobby のままであることを確認した

### 9.4 再デプロイする

環境変数は**ビルド時に取り込まれる**ため、設定後に再デプロイが必要です。

- [ ] Vercel → Deployments → 最新を **Redeploy**

---

## Phase 10: GitHub Actions(自動デプロイ)の有効化

### 10.1 Secrets / Variables を登録する

```bash
cd infra/prod
gh secret set AWS_DEPLOY_ROLE_ARN   --body "$(terraform output -raw github_deploy_role_arn)"
gh secret set APPRUNNER_SERVICE_ARN --body "$(terraform output -raw apprunner_service_arn)"
gh variable set AWS_BOOTSTRAPPED    --body "true"
```

コンソールで行う場合: GitHub → Settings → Secrets and variables → Actions

| 種別     | 名前                    | 値                                            |
| -------- | ----------------------- | --------------------------------------------- |
| Secret   | `AWS_DEPLOY_ROLE_ARN`   | `terraform output -raw github_deploy_role_arn` |
| Secret   | `APPRUNNER_SERVICE_ARN` | `terraform output -raw apprunner_service_arn`  |
| Variable | `AWS_BOOTSTRAPPED`      | `true`                                         |

- [ ] 3 つ登録した

### 10.2 デプロイを実行して確認する

```bash
gh workflow run "Deploy API to App Runner"
gh run watch
```

### 10.3 環境変数が保持されていることを確認する

```bash
aws apprunner describe-service \
  --service-arn "$(cd infra/prod && terraform output -raw apprunner_service_arn)" \
  --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentSecrets | keys' \
  --output json
# → 10 キーが並ぶこと(空配列なら設定が飛んでいる)
```

- [ ] 10 キーが残っている

> **前提**: `deploy.yml` の App Runner 更新は、`describe-service` で現在の `SourceConfiguration` を取得し `ImageIdentifier` だけを差し替える方式です(2026-07-25 修正)。UpdateService の `SourceConfiguration` は**マージではなく置き換え**のため、イメージタグだけを渡すと env / secrets / アクセスロールが消えます。ワークフローにはシークレットが 0 件なら更新を中止するガードも入っています。
>
> この方式は `apprunner:ListOperations` と App Runner ロールへの `iam:PassRole` を必要とします。いずれも `cicd.tf` に含まれているので、**2026-07-25 以前に apply 済みの場合は再度 `terraform apply` して IAM ポリシーを更新**してください。
>
> 万一設定が飛んだ場合は `terraform apply` で戻せます(`image_identifier` は `ignore_changes` 対象なのでタグは維持されます)。

---

## Phase 11: 本番疎通テスト

`docs/acceptance-test-spec.md` のうち、**ローカルで確認できなかった「⚠外部」項目**をここで消化します。

### 11.1 認証・オンボーディング

- [ ] `https://example.app` からサインアップできる
- [ ] Clerk webhook が発火し、`User` 行が作られる(403「同期待ち」にならない)
- [ ] `/onboarding` からワークスペースを作成できる
- [ ] 作成直後が **`Tenant.plan = PRO` / `Subscription.status = TRIALING`**(7 日トライアル)
- [ ] 設定 → 利用状況に「Pro / 300 cr」、Billing に「トライアル終了: {日付}」が出る

### 11.2 AI 機能

- [ ] README 生成(Haiku)が成功する
- [ ] プロダクト診断 / アイデア検証(Sonnet + Web Search)が成功し、`competitorRefs` が入る
- [ ] AI クレジットが消費され、利用状況の残数に反映される

### 11.3 メール

- [ ] メンバー招待を送ると**実際にメールが届く**(送信元が `noreply@example.app` になっている)
- [ ] 招待リンクから承諾できる

### 11.4 課金(Stripe)

- [ ] Billing → 「Stripe Customer Portal を開く」で Portal に遷移する(BIL-12)
- [ ] **Checkout**(BIL-23): `plan = FREE` の状態でプラン比較に「Pro にアップグレード」が出る → 決済完走 → `checkout.session.completed` → `Tenant.plan = PRO` + AI 機能が再開
- [ ] トライアル中 / 有料中はアップグレードボタンが出ない(BIL-24、二重契約の防止)
- [ ] Stripe Dashboard の Webhook ログが 2xx

### 11.5 公開ページ・SEO

- [ ] `https://example.app/p/{slug}/{projectId}` が匿名で表示される
- [ ] `https://example.app/p/{slug}/{projectId}/blog/{postSlug}` が匿名で表示される
- [ ] `https://example.app/robots.txt` / `sitemap.xml` が返る

### 11.6 告知配信

[`adr-014-release-checklist.md`](./adr-014-release-checklist.md) §4 に従って確認します(Twitter は Web Intent 方式なのでインフラ設定は不要)。

---

## Phase 12: 公開前の最終設定

### 12.1 RDS の保護を有効化する

```hcl
# infra/prod/terraform.tfvars
db_deletion_protection = true
db_skip_final_snapshot = false
```

```bash
cd infra/prod && terraform apply
```

- [ ] 適用した

### 12.2 アラートを受け取れる状態にする

- [ ] `budget_alert_email` 宛に届いた **SNS の購読確認メールを Confirm** する ← 未確認だとアラートが一切届きません

```bash
aws sns list-subscriptions-by-topic \
  --topic-arn "$(cd infra/prod && terraform output -raw sns_alerts_topic_arn)" \
  --query 'Subscriptions[].[Endpoint,SubscriptionArn]' --output table
# SubscriptionArn が "PendingConfirmation" でないこと
```

- [ ] AWS Cost Anomaly Detection(無料)を有効化する

### 12.3 コスト管理の初期設定

- [ ] **初期クレジットの実額と有効期限を控え、カレンダーに期限日を登録**する(Billing コンソール → Credits)
- [ ] Cost Explorer を有効化し、**クレジット適用前の請求額**を見られるようにする

> **AWS Budgets はクレジット適用後の実請求額で判定される**ため、クレジットが残っている間はアラートが鳴りません。クレジットで隠れている本来のコストは Cost Explorer で確認してください([`../infrastructure-cost.md`](../infrastructure-cost.md) §2.7)。
>
> また **クレジットが打ち消すのは AWS の請求だけ**です。ドメイン代と AI 原価(Anthropic / OpenAI)は初月から実費で、公開後はトライアルユーザーの AI 消費が全額持ち出しになります。

---

## 13. ロールバック / 撤収

### アプリだけ戻す

```bash
git revert <commit> && git push origin main    # deploy.yml が前のコードで再デプロイ
```

または App Runner を 1 つ前のイメージタグへ:

```bash
gh workflow run "Deploy API to App Runner" --ref <前のコミット>
```

### インフラを畳む(**公開前の検証中のみ**)

```bash
cd infra/prod && terraform destroy
```

- 課金リソース(RDS / NAT / App Runner)が消えれば課金は止まります
- `db_deletion_protection = true` にした後は destroy がブロックされます(先に `false` に戻す)
- **公開後は使えません。データが消えます**

### 一時的に費用を止める(検証期間中)

App Runner を **Pause** すると、プロビジョニングメモリ課金($10/月相当)が止まります。

```bash
aws apprunner pause-service --service-arn "$(cd infra/prod && terraform output -raw apprunner_service_arn)"
aws apprunner resume-service --service-arn "$(cd infra/prod && terraform output -raw apprunner_service_arn)"
```

---

## 14. よくある詰まりどころ

| 症状                                              | 原因 / 対処                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| App Runner が `exec format error` で起動しない    | **arm64 でビルドしている**。`docker buildx build --platform linux/amd64` で作り直す(§7.1)               |
| App Runner が起動しない(その他)                   | Secrets が `REPLACE_ME` のまま / ECR タグが存在しない / インスタンスロールに Secrets 読取権が無い        |
| App Runner が起動直後に落ちる                     | メモリ不足の可能性。`apprunner_memory` を `2048` に戻す(§7.4)                                           |
| API から外部 API(Anthropic 等)に出られない        | NAT インスタンスと Private Subnet のルートを確認。VPC Flow Logs(`REJECT`)に拒否が出ていないか            |
| `POST /webhooks/clerk` が 500                     | `CLERK_WEBHOOK_SECRET` 未設定 / 更新後に再デプロイしていない(§8-6)                                      |
| サインアップしても 403「同期待ち」                | Clerk webhook が届いていない。Clerk Dashboard の配信ログを確認(§8)                                      |
| Stripe Portal が 400                              | Customer Portal が Activate されていない(§4.3)                                                          |
| Checkout で「価格が見つかりません」               | `STRIPE_PRICE_*` がテストモードの Price ID になっている(§4.2)                                           |
| 招待メールが届かない                              | Resend のドメイン検証未完了 / `mail_from` が独自ドメインなのに未 verify(§3.3)                          |
| `terraform apply` で NAT の AMI が見つからない    | `nat_ami_id` を明示指定する(§2.1)                                                                       |
| ホストゾーンが 2 つある                           | Route53 でドメイン登録した際の自動作成分。import するか削除する(§1.3)                                   |
| 予算アラートが毎月鳴る / 全く鳴らない             | 閾値が固定フロアと不整合 / クレジット期間中で実請求が 0(§12.3)                                          |
| SSM ポートフォワードが繋がらない                  | `session-manager-plugin` 未インストール / NAT の SSM エージェント未起動(§6.2)                           |

---

## 関連ドキュメント

| ドキュメント                                                              | 用途                                     |
| ------------------------------------------------------------------------- | ---------------------------------------- |
| [`../infrastructure-cost.md`](../infrastructure-cost.md)                  | コスト構造・削減方針・クレジットの実態   |
| [`../../infra/README.md`](../../infra/README.md)                          | Terraform の構成とリソース一覧           |
| [`adr-012-release-checklist.md`](./adr-012-release-checklist.md)          | Stripe / プラン構造の背景と既知の制約    |
| [`adr-014-release-checklist.md`](./adr-014-release-checklist.md)          | 告知配信の公開後確認                     |
| [`adr-014-twitter-integration.md`](./adr-014-twitter-integration.md)      | Twitter(Web Intent 方式)の運用           |
| [`clerk-webhook-troubleshooting.md`](./clerk-webhook-troubleshooting.md)  | Clerk webhook の詳細な切り分け           |
| [`../acceptance-test-spec.md`](../acceptance-test-spec.md)                | 受入検証(Phase 11 の元ネタ)              |
| [`../adr/010-iac-tool.md`](../adr/010-iac-tool.md) / [`011-lightweight-aws-architecture.md`](../adr/011-lightweight-aws-architecture.md) | インフラ構成の決定経緯 |
