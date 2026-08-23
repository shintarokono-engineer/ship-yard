# ADR-012 v1.0.1 リリース時チェックリスト

このランブックは ADR-012(プラン構造の全面見直し)を本番リリース(Day 49 前後)で有効化するために必要な、コード以外の手作業をまとめたものです。コード変更は `feature/adr-012-release-prep` ブランチで実装済(Saga 第 1 層 + AI クレジット計算の Subscription.quantity 切替 + 7 日 Pro トライアル)。

## 0. 前提

- Stripe Dashboard へのアクセス権(本番アカウント)
- 本番環境の Secrets Manager(AWS)更新権限
- 本番 DB に対する migration 適用権限(`prisma migrate deploy`)

## 1. Stripe Dashboard: 新プラン構造を作成

### Pro プラン

- [ ] Stripe Dashboard → Products → **「+ Add product」**
  - Name: `Neorie Pro`
  - Description: `Pro プラン(個人開発者向け、AI クレジット 300/月)`
- [ ] Price を追加:
  - Pricing model: **Standard pricing**
  - Price: **¥1,480 JPY**
  - Billing period: **Monthly**(recurring)
  - 作成後の `price_xxx...` をメモ → `STRIPE_PRICE_PRO` に設定する

### Team プラン

- [ ] Stripe Dashboard → Products → **「+ Add product」**
  - Name: `Neorie Team`
  - Description: `Team プラン(2 人以上のチーム向け、AI クレジット 800/人・月)`
- [ ] Price を追加:
  - Pricing model: **Standard pricing**
  - Price: **¥2,800 JPY**
  - Billing period: **Monthly**(recurring)
  - **「Charge per unit」を ON にして、Subscription Quantity に応じた人数課金にする**
  - 作成後の `price_xxx...` をメモ → `STRIPE_PRICE_TEAM` に設定する

### Customer Portal の設定

- [ ] Stripe Dashboard → Settings → Billing → Customer Portal:
  - **Activate** ボタンを押す(未設定だと `billingPortal.sessions.create` が 400 を返す)
  - 支払い方法の追加・更新を許可
  - サブスクリプションのキャンセル / プラン変更を許可
  - 「Returns to your application」 URL は `<APP_BASE_URL>/w/{slug}/settings/billing`(client が動的に渡すので Dashboard 側はフォールバック設定のみ)

### Webhook の設定(既存と同じ)

- [ ] Stripe Dashboard → Developers → Webhooks → 本番エンドポイント `<APP_BASE_URL>/webhooks/stripe`:
  - 既存の `checkout.session.completed` / `customer.subscription.created` / `.updated` / `.deleted` / `invoice.paid` / `invoice.payment_failed` をそのまま使用
  - 新規追加は不要(トライアル開始時の `customer.subscription.created` でハンドルされる)

## 2. 環境変数(Secrets Manager / `.env.local`)

以下を新しい本番 Price ID で更新:

- [ ] `STRIPE_PRICE_PRO` = 1 で作成した Pro Price ID(`price_xxx...`)
- [ ] `STRIPE_PRICE_TEAM` = 1 で作成した Team Price ID(`price_xxx...`)
- [ ] `STRIPE_SECRET_KEY` = 本番モード(`sk_live_...`)
- [ ] `STRIPE_WEBHOOK_SECRET` = 本番 Webhook エンドポイントから取得した `whsec_...`
- [ ] `CLERK_WEBHOOK_SECRET` = Clerk Dashboard の webhook エンドポイントから取得した Svix 署名シークレット
      (未設定だと `POST /webhooks/clerk` が 500 を返し続け、`User` プロビジョニングが動かない)
- [ ] `INTERNAL_JOB_TOKEN` = `openssl rand -hex 32` で生成した 64 文字の hex(F20 内部ジョブの共有シークレット)
      **同じ値を EventBridge Connection(`shipyard-prod-internal-job`)の API key にも設定すること。**
      不一致だと日次バッチが 401 で失敗し続ける(`shipyard-prod-trial-reminders-failed` アラームで検知される)

ローカル動作確認時は既存の `stripe listen` の `whsec_...` を使う(従来どおり)。

Secrets Manager 側のキー構造は `infra/prod/secrets.tf` の `app_secret_keys`(**計 11 キー**)で管理し、
値のみ apply 後に手動投入する。`apps/api/.env.example` にキーを追加したら `secrets.tf` も同時に更新すること。

## 3. DB Migration の適用

このブランチで追加した `20260526130000_add_subscription_quantity` を本番 DB に適用:

```bash
# 本番に適用(本番 DATABASE_URL を環境変数で指定)
DATABASE_URL="postgresql://..." pnpm --filter @shipyard/db exec prisma migrate deploy
```

適用後の確認:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'Subscription' AND column_name = 'quantity';
-- → quantity | integer | 1
```

既存テナント(あれば)は `quantity = 1` で開始。招待承諾・退会時の Saga と Webhook で順次正規値に収束します。

## 4. デプロイ手順(コード側)

### 4.1 main マージ前の最終チェック

- [ ] ローカルで型チェック・lint 通過(`pnpm --filter @shipyard/api exec tsc --noEmit` / `pnpm lint`)
- [ ] ローカルで `pnpm dev` で起動、`/onboarding` から新規ワークスペース作成 → Tenant.plan = PRO + Subscription.status = TRIALING を確認
- [ ] ローカルで Team プラン(DB 直書き)に切替後、招待承諾 → Subscription.quantity が +1 されることを Stripe Dashboard で確認

### 4.2 デプロイ

- [ ] `feature/adr-012-release-prep` を main にマージ
- [ ] GitHub Actions の `deploy.yml` で App Runner にデプロイ(コンテナ再起動)
- [ ] App Runner ログで起動成功を確認

## 5. リリース直後の動作確認(本番)

- [ ] **新規 signup**:Pro トライアル状態(TRIALING)で作成されること
  - 利用状況タブ:「Pro / 300 cr」が表示される
  - Billing 画面:「トライアル中、終了日 = Day+7」が表示される
- [ ] **Team プランで招待**:メンバー追加 → Stripe Quantity が +1、AI クレジット上限が +800 されること
- [ ] **Team プランで退会**:メンバー削除 → Stripe Quantity が -1、AI クレジット上限が -800 されること
- [ ] **トライアル終了(本番では検証困難)**:Stripe テストアカウントで `trial_period_days: 1` の Subscription を作成、1 日後に `customer.subscription.deleted` Webhook が来て Tenant.plan = FREE になることを stg で事前検証
- [ ] **FREE からの新規契約(Checkout)**:上記でトライアルを終了させたテナントの Billing 画面で、
      プラン比較カードに「Pro / Team にアップグレード」ボタンが出ること → 押下で Stripe Checkout に遷移 →
      決済完了で `checkout.session.completed` → `Tenant.plan = PRO`(または TEAM)+ AI 機能が再開すること
  - Portal はプラン変更ができない(Subscription が無いため)。この状態の課金導線は Checkout のみ
- [ ] **トライアル中 / 有料中はアップグレードボタンが出ない**こと(Checkout 経由の二重契約防止)。
      プラン変更・解約は Customer Portal 側で行えること

## 6. 既知の制約(MVP)

- **第 3 層 reconciliation バッチは v1.x**:write 同期が失敗してログのみ残った場合、現状は手動 SQL で補正する必要がある。日次バッチは v1.x で実装予定
- ~~**トライアル通知メール無し**:7 日 / 1 日前のリマインダーは v1.x。トライアル終了は Stripe Email(本番アカウント設定)に任せる~~ → **✅ 2026-08-23 実装完了(F20)**。本番投入手順は下記「8. F20: トライアル終了通知メールの本番投入」を参照
- **追加クレジット購入無し**:月内に 300 cr 使い切ったら「翌月の更新まで待つ」のみ。100 cr / ¥500 の追加購入は v1.x
- **プラン変更の導線が状態で分かれる**:Subscription 有り = Customer Portal、無し(FREE)= Checkout ボタン。
  Stripe Portal は Subscription を持たない顧客に新規契約させられないための構造的な使い分けで、統合は v1.x で再検討
- **所有権譲渡の UI 無し**:`POST /workspaces/:slug/transfer-ownership` は実装済だが画面導線が無い(v1.x)。
  メンバー画面では OWNER 行のロール変更・削除を一切禁止しているため所有権を誤って失う事故は起きないが、
  **Team 契約で OWNER が離脱した場合は運用者が DB / API で手動対応する**
- **ダークモード非対応**:`.dark` variant の CSS 変数はあるがテーマ切替 Provider が無く、アプリはライト固定(v1.x / F14)

## 7. ロールバック手順

万一、新トライアル機構で signup が失敗するようになった場合:

- [ ] GitHub Actions で main から 1 つ前のコミットをデプロイ(`git revert <merge-commit>` → 再 push)
- [ ] 本番 DB の `Subscription.quantity` 列は残しても無害(read 側 fallback あり)
- [ ] Stripe Dashboard の新 Product / Price は残しても無害(旧 Price ID を使い続ければ動く)

ロールバック後の影響:

- `initializeFreeSubscription`(旧)に戻る → 新規ユーザーは FREE 開始(= AI 停止)
- 既存ユーザーへの影響なし(Tenant.plan は維持される)

## 8. F20: トライアル終了通知メールの本番投入

`feature/f20-trial-reminder-email` で実装済(Prisma `TrialNotification` model / バッチサービス / 内部 HTTP エンドポイント / ガード / EventBridge Terraform / アラーム 2 本)。本番投入は Secrets Manager と EventBridge Connection への手動投入が起点になるため、`terraform apply` だけでは完結しない。

### 8.1 `INTERNAL_JOB_TOKEN` を 2 箇所に投入する

`put-secret-value` はシークレットの JSON を丸ごと置き換えるため、既存の値を取得して `jq` でマージしてから書き戻す。

```bash
TOKEN=$(openssl rand -hex 32)
SECRET_ARN=$(aws secretsmanager list-secrets \
  --query "SecretList[?starts_with(Name, 'shipyard-prod-app-config')].ARN | [0]" --output text)

CURRENT=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)
UPDATED=$(printf '%s' "$CURRENT" | jq --arg v "$TOKEN" '.INTERNAL_JOB_TOKEN = $v')
aws secretsmanager put-secret-value --secret-id "$SECRET_ARN" --secret-string "$UPDATED"

aws events update-connection \
  --name shipyard-prod-internal-job \
  --authorization-type API_KEY \
  --auth-parameters "ApiKeyAuthParameters={ApiKeyName=X-Internal-Job-Token,ApiKeyValue=$TOKEN}"
```

- [ ] Secrets Manager 側(`shipyard-prod-app-config-*` の `INTERNAL_JOB_TOKEN`)に投入した
- [ ] EventBridge Connection(`shipyard-prod-internal-job`)側に同じ値を投入した

**どちらか一方だけ投入し忘れると、エンドポイントは 500 を返し `shipyard-prod-trial-reminders-failed` アラームが当日中に発報する。これは意図した挙動**。ガードは `REPLACE_ME` というリテラルを「未設定」として拒否するため、両方の手動投入を忘れると両者が `REPLACE_ME` のまま一致して**サイレントに認証を通してしまう**事故を防いでいる。

### 8.2 Terraform を apply する

```bash
terraform -chdir=infra/prod apply
```

- [ ] 新規リソース 7 つ + アラーム 1 本(既存 apprunner-5xx 等に追加する形)が作成されることを確認した
- [ ] **既存リソース、特に App Runner サービスが replace されない**ことを plan の段階で確認した

### 8.3 API を再デプロイする

Secrets Manager の値は App Runner 起動時にしか解決されないため、8.1 の投入だけでは値が反映されない。GitHub Actions のデプロイワークフローを実行する。

- [ ] `gh workflow run "Deploy API to App Runner"` を実行し、`gh run watch` で完了を確認した
- [ ] App Runner の `UpdateService` は `SourceConfiguration` をマージではなく置き換えるため、env / secrets が引き続き揃っていることを確認した(確認手順は `docs/runbooks/production-cutover.md` §10.3 と同じ)

### 8.4 エンドポイントをスモークテストする

```bash
curl -i -X POST https://api.neorie.com/internal/jobs/trial-reminders
curl -i -X POST https://api.neorie.com/internal/jobs/trial-reminders -H "X-Internal-Job-Token: $TOKEN"
```

- [ ] トークン無しは **401**
- [ ] トークン有りは **200** + 集計結果の JSON

### 8.5 EventBridge が実際に発火することを確認する

- [ ] コンソールでルールのスケジュールを一時的に `rate(5 minutes)` に変更し、数分待つ
- [ ] CloudWatch Logs に `trial-reminders finished: {...}` が出ていることを確認した
- [ ] ルールの `Invocations` が 1 以上、`FailedInvocations` が 0 であることを確認した
- [ ] 確認後、`cron(0 3 * * ? *)` に戻す。**コンソールでの直接変更は drift になるため、`terraform apply` で戻すこと**

### 8.6 apply 直後に鳴る 1 回限りのアラームについて

`terraform apply` 直後、初回の 03:00 UTC 実行が来るまでは `Invocations` メトリクス自体が存在しない。`shipyard-prod-trial-reminders-not-invoked` は `treat_missing_data = "breaching"` のため、このデータ欠損期間を「異常」として 1 回だけ発報する。`datapoints_to_alarm` の設定とは無関係に `breaching` 指定そのものに起因する既知の挙動で、対応不要。ルールが通常どおり発火し始めれば自動的に解消する。
