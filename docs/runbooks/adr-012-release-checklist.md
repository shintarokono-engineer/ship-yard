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

**2026-08-29 に実施済み。以下は机上の手順ではなく、実際に通した手順**に書き換えたもの(初版には順序・要否の誤りが 4 件あり、そのままでは完了しない内容だった)。次に同じ構成でバッチを追加するとき(F15 Reconciliation を想定)は、この節をそのまま辿れる。

対象は Prisma `TrialNotification` model / バッチサービス / 内部 HTTP エンドポイント / ガード / EventBridge の Terraform / アラーム 2 本。

### 8.0 実行順序(ここを間違えると詰まる)

```
① DB マイグレーション
② Secrets Manager に INTERNAL_JOB_TOKEN を投入   ← apply より前
③ terraform apply
④ EventBridge Connection に同じ値を投入          ← apply より後
⑤ スモークテスト
⑥ EventBridge の実発火を確認
```

**②(Secrets Manager)と ④(Connection)は apply を挟んで前後に分かれる**。まとめて先に実行することはできない。

| 手順              | apply との前後 | 理由                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ② Secrets Manager | **前**         | `secrets.tf` の `aws_secretsmanager_secret_version.app` には `ignore_changes = [secret_string]` があるため、`app_secret_keys` にキーを足しても **apply ではシークレット本体にキーが増えない**。一方 `apprunner.tf` はそのキー一覧から `runtime_environment_secrets` を生成するので、キー不在のまま apply すると App Runner が参照を解決できずデプロイに失敗する |
| ④ Connection      | **後**         | `aws_cloudwatch_event_connection.internal_job` は apply が作るリソース。事前に `aws events update-connection` を叩くと `ResourceNotFoundException` になる                                                                                                                                                                                                       |

**API の再デプロイ手順は不要**。`main` への push で `Deploy API to App Runner` が自動実行されており、加えて ③ の apply が `UpdateService` で App Runner を更新するため、そこで新しいシークレットが反映される。`image_identifier` は `ignore_changes` で保護されているのでイメージが巻き戻ることもない(ただし `terraform plan/apply` に `-refresh=false` を付けないこと。state を最新化しないと古いタグを送る)。

### 8.1 DB マイグレーションを適用する

`TrialNotification` テーブルを追加する `20260823072116_add_trial_notification` を本番へ適用する。**これを忘れて EventBridge を有効化すると、バッチが全候補で Prisma エラーになる。**

本番 RDS は VPC 内にあるため、`production-cutover.md` §6.1〜6.2 の手順で SSM ポートフォワードを張ってから実行する。

```bash
# 別ターミナルでポートフォワードを張ったうえで
DATABASE_URL="postgresql://shipyard:<マスターパスワード>@localhost:15432/shipyard?schema=public&sslmode=require" \
  pnpm --filter @shipyard/db exec prisma migrate deploy
```

- [ ] 適用待ちが `20260823072116_add_trial_notification` の 1 本だけであることを `migrate status` で確認した
- [ ] 接続先が本番であることを確認した(`migrate status` の出力するポートが、ローカル `.env` の 5432 ではなくトンネルの 15432 になっていること)

> `prisma migrate status` は未適用がある場合に終了コード 1 を返す。これは正常。

適用後、以下を確認する。

```sql
SELECT tablename FROM pg_tables WHERE tablename = 'TrialNotification';
SELECT indexname FROM pg_indexes WHERE tablename = 'TrialNotification';
SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
 WHERE t.typname = 'TrialNotificationKind';
SELECT grantee, privilege_type FROM information_schema.table_privileges
 WHERE table_name = 'TrialNotification' AND grantee = 'shipyard_app';
```

- [ ] `TrialNotification_tenantId_kind_key` が存在する(**冪等性の唯一の担保**。これが無いと二重送信する)
- [ ] enum に `THREE_DAYS` / `LAST_DAY` がある
- [ ] **`shipyard_app` に SELECT / INSERT / UPDATE / DELETE の 4 権限がある**

> 最後の確認が重要。migration はマスターユーザー `shipyard` が実行する一方、アプリは `shipyard_app` で接続する。新テーブルへの権限は `production-cutover.md` §6.5 の `ALTER DEFAULT PRIVILEGES` に依存しており、これが効いていないと**テーブルは存在するのに実行時に `permission denied`** になる。

### 8.2 `INTERNAL_JOB_TOKEN` を Secrets Manager に投入する(apply より前)

`put-secret-value` はシークレットの JSON を丸ごと置き換えるため、既存の値を取得して `jq` でマージしてから書き戻す。

```bash
TOKEN=$(openssl rand -hex 32)
SECRET_ID=$(aws secretsmanager list-secrets \
  --query "SecretList[?starts_with(Name,'shipyard-prod-app-config')].Name | [0]" --output text)

CURRENT=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text)
UPDATED=$(printf '%s' "$CURRENT" | jq --arg v "$TOKEN" '.INTERNAL_JOB_TOKEN = $v')

# 書き込み前に既存キーの破壊を検出する(新キーを消すと元の JSON と一致するはず)
printf '%s' "$UPDATED" | jq -e --argjson c "$CURRENT" 'del(.INTERNAL_JOB_TOKEN) == $c' >/dev/null \
  || { echo "既存キーが変化している。中止"; exit 1; }

aws secretsmanager put-secret-value --secret-id "$SECRET_ID" --secret-string "$UPDATED"
```

- [ ] 投入後のキー数が 1 増えている(F20 時点で 10 → 11)
- [ ] `INTERNAL_JOB_TOKEN` が 16 進 64 桁で、`REPLACE_ME` ではない

> `put-secret-value` は新バージョンを作るだけで直前の値は `AWSPREVIOUS` に残るため、誤ってもロールバックできる。
>
> **トークンの値は画面に出さないこと。** ④ で使う際は Secrets Manager から読み戻せばよく、人間が控える必要はない。

### 8.3 Terraform を apply する

plan をファイルに保存し、内容を確認してからそのプランを適用する(確認プロンプトが出ず、見た内容以外は実行されない)。

```bash
terraform -chdir=infra/prod plan -out=/tmp/f20.tfplan
terraform -chdir=infra/prod apply /tmp/f20.tfplan
```

F20 実施時の実績は **8 added, 1 changed, 0 destroyed**(所要 3 分 30 秒ほど。大半は App Runner の更新待ち)。

- [ ] `0 to destroy` である
- [ ] App Runner が `~ update in-place` であり、`-/+ replace` ではない
- [ ] App Runner の差分が `runtime_environment_secrets` への `INTERNAL_JOB_TOKEN` 追加のみで、既存キーが `unchanged` と表示されている
- [ ] `aws_secretsmanager_secret_version.app` が plan に出ていない(`ignore_changes` が効いている証拠)

apply 後、App Runner が期待どおりか確認する。

```bash
aws apprunner describe-service --service-arn <ARN> \
  --query '{Status:Service.Status,
            SecretKeys:keys(Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentSecrets),
            Image:Service.SourceConfiguration.ImageRepository.ImageIdentifier}'
```

- [ ] `Status` が `RUNNING`
- [ ] シークレットキーに `INTERNAL_JOB_TOKEN` を含む
- [ ] `Image` のタグが意図したコミット SHA(巻き戻っていない)

### 8.4 EventBridge Connection に同じ値を投入する(apply より後)

**トークンを手で 2 回入力しない。** Secrets Manager から読み戻すことで、2 箇所の値が一致することを構造的に保証する。

```bash
TOKEN=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" \
  --query SecretString --output text | jq -r '.INTERNAL_JOB_TOKEN')

# プレースホルダや空値を流し込まないための事前チェック
printf '%s' "$TOKEN" | grep -qE '^[0-9a-f]{64}$' || { echo "トークンの形式が不正。中止"; exit 1; }

aws events update-connection \
  --name shipyard-prod-internal-job \
  --authorization-type API_KEY \
  --auth-parameters "ApiKeyAuthParameters={ApiKeyName=X-Internal-Job-Token,ApiKeyValue=$TOKEN}"
```

- [ ] `ConnectionState` が `AUTHORIZED` になった(更新直後は一時的に `UPDATING` / `AUTHORIZING` になる)

> `scheduler.tf` の Connection には `ignore_changes = [auth_parameters]` があるため、この手動投入が次回 apply で `REPLACE_ME` に戻されることはない。
>
> ヘッダ名 `X-Internal-Job-Token` は変えないこと。ガードが読む `x-internal-job-token`(`jobs.constants.ts`)と対応している。HTTP ヘッダ名は大文字小文字を区別しないため、この表記の差は問題ない。

### 8.5 エンドポイントをスモークテストする

**実行前に送信対象を確認する。** 対象が 1 件でもあれば本物のメールが飛ぶ。

```sql
SELECT t.slug, s."currentPeriodEnd"
  FROM "Subscription" s JOIN "Tenant" t ON t.id = s."tenantId"
 WHERE s.status = 'TRIALING'
   AND s."currentPeriodEnd" > now()
   AND s."currentPeriodEnd" <= now() + interval '4 days';
```

バッチはさらに Stripe を参照してカード登録済みを除外するため、この件数は上限値。

```bash
curl -i -X POST https://api.neorie.com/internal/jobs/trial-reminders
curl -i -X POST https://api.neorie.com/internal/jobs/trial-reminders \
  -H "X-Internal-Job-Token: 0000000000000000000000000000000000000000000000000000000000000000"
curl -i -X POST https://api.neorie.com/internal/jobs/trial-reminders \
  -H "X-Internal-Job-Token: $TOKEN"
```

- [ ] トークン無しは **401**
- [ ] 誤ったトークンも **401**(ここが 200 ならトークン比較に欠陥があるので即中止)
- [ ] 正しいトークンは **200** + 集計 JSON

> 1 つ目が **500 ではなく 401** であることが、App Runner に実トークンが渡っている証拠になる。ガードは `INTERNAL_JOB_TOKEN` が未設定または `REPLACE_ME` のとき 500 を返すため、500 なら 8.2 か 8.3 が反映されていない。

### 8.6 EventBridge が実際に発火することを確認する

ルールを一時的に短周期へ変更する。**復元は `terraform plan` で機械的に確認できる**(`schedule_expression` に `ignore_changes` は無く、drift として検出される)。

```bash
RULE=shipyard-prod-trial-reminders-daily
DESC='毎日 03:00 UTC(12:00 JST)にトライアル終了通知バッチを起動する'

# 短周期に変更。description / state を明示するのは put-rule が省略属性を
# 引き継がない場合があり、意図しない drift を作り込まないため。
aws events put-rule --name "$RULE" --schedule-expression 'rate(5 minutes)' \
  --description "$DESC" --state ENABLED

# … 6〜8 分待つ …

# 復元
aws events put-rule --name "$RULE" --schedule-expression 'cron(0 3 * * ? *)' \
  --description "$DESC" --state ENABLED
terraform -chdir=infra/prod plan   # → No changes. を確認する
```

確認するログは App Runner の application ロググループ。**サービス ID が複数残っている場合があるので、prefix の先頭を機械的に選ばないこと**(稼働していない古いサービスのロググループを掴んで「ログが出ていない」と誤診する)。`describe-service` が返す ARN の ID と一致するものを使う。

```bash
aws logs filter-log-events \
  --log-group-name /aws/apprunner/shipyard-prod-api/<稼働中のサービス ID>/application \
  --start-time $(( $(date -u +%s) - 1800 ))000 \
  --filter-pattern '"trial-reminders"' --query 'events[].[message]' --output text
```

- [ ] `Invocations` が 1 以上、`FailedInvocations` が 0
- [ ] ログに `trial-reminders finished: {...}` が出ている
- [ ] ガードの 401 が `missing token header` / `token mismatch` と区別して記録されている(障害時の切り分けに使う)
- [ ] `cron(0 3 * * ? *)` に戻し、`terraform plan` が `No changes.` になった

### 8.7 アラームの初期挙動(2 日ほど ALARM のままになる)

`shipyard-prod-trial-reminders-not-invoked` は導入直後に **ALARM になり、解消まで約 2 日かかる**。故障ではないので、この期間の発報は無視してよい。

理由は評価単位にある。このアラームは `period = 86400`(1 日)を 1 データポイントとし、`evaluation_periods = 2` で**完了した**直近 2 期間を見る。`datapoints_to_alarm = 1` なので、2 日のうち 1 日でも欠損があれば ALARM になる(`treat_missing_data = "breaching"`)。ルール作成直後は、完了済みの直近 2 日がいずれもルール不在の期間なので、両方とも欠損=異常と数えられる。

| 時点     | 評価される 2 日                  | 状態           |
| -------- | -------------------------------- | -------------- |
| 作成直後 | 前々日・前日(いずれもルール不在) | **ALARM**      |
| 翌日     | 前日(欠損)+ 当日(発火済み)       | **まだ ALARM** |
| 翌々日   | 発火済み 2 日分                  | **OK に復帰**  |

作成直後の短時間は `INSUFFICIENT_DATA` を経由する(初版に「apply 直後に 1 回鳴る」と書いていたのは不正確だった)。

- [ ] **作成から 2 日後に OK へ戻ったことを確認する。**戻らない場合は定時発火が実際に起きていないので調査する

> この 2 日という復帰時間は `datapoints_to_alarm = 1` の代償。既定の 2 のままだと「2 日連続で止まらないと鳴らない」= 1 日だけの停止を永久に見逃すため、見逃しを減らす側を選んだ意図的なトレードオフ。

### 8.8 この構成で監視できないこと

- **部分失敗は検知できない。** 一部の宛先だけ送信に失敗した場合はエンドポイントが 200 を返すため `FailedInvocations` に出ない。1 件の恒久的な失敗で毎日アラームが鳴るのを避けた判断で、レスポンス JSON と `failed` カウントのログには現れる
- **スタック全体を破壊された場合は検知できない。** アラーム自体が同じスタック内にあるため(構造上の限界)
