# ADR-012 v1.0.1 リリース時チェックリスト

このランブックは ADR-012(プラン構造の全面見直し)を本番リリース(Day 49 前後)で有効化するために必要な、コード以外の手作業をまとめたものです。コード変更は `feature/adr-012-release-prep` ブランチで実装済(Saga 第 1 層 + AI クレジット計算の Subscription.quantity 切替 + 7 日 Pro トライアル)。

## 0. 前提

- Stripe Dashboard へのアクセス権(本番アカウント)
- 本番環境の Secrets Manager(AWS)更新権限
- 本番 DB に対する migration 適用権限(`prisma migrate deploy`)

## 1. Stripe Dashboard: 新プラン構造を作成

### Pro プラン

- [ ] Stripe Dashboard → Products → **「+ Add product」**
  - Name: `Shipyard Pro`
  - Description: `Pro プラン(個人開発者向け、AI クレジット 300/月)`
- [ ] Price を追加:
  - Pricing model: **Standard pricing**
  - Price: **¥1,480 JPY**
  - Billing period: **Monthly**(recurring)
  - 作成後の `price_xxx...` をメモ → `STRIPE_PRICE_PRO` に設定する

### Team プラン

- [ ] Stripe Dashboard → Products → **「+ Add product」**
  - Name: `Shipyard Team`
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

ローカル動作確認時は既存の `stripe listen` の `whsec_...` を使う(従来どおり)。

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

## 6. 既知の制約(MVP)

- **第 3 層 reconciliation バッチは v1.x**:write 同期が失敗してログのみ残った場合、現状は手動 SQL で補正する必要がある。日次バッチは v1.x で実装予定
- **トライアル通知メール無し**:7 日 / 1 日前のリマインダーは v1.x。トライアル終了は Stripe Email(本番アカウント設定)に任せる
- **追加クレジット購入無し**:月内に 300 cr 使い切ったら「翌月の更新まで待つ」のみ。100 cr / ¥500 の追加購入は v1.x

## 7. ロールバック手順

万一、新トライアル機構で signup が失敗するようになった場合:

- [ ] GitHub Actions で main から 1 つ前のコミットをデプロイ(`git revert <merge-commit>` → 再 push)
- [ ] 本番 DB の `Subscription.quantity` 列は残しても無害(read 側 fallback あり)
- [ ] Stripe Dashboard の新 Product / Price は残しても無害(旧 Price ID を使い続ければ動く)

ロールバック後の影響:
- `initializeFreeSubscription`(旧)に戻る → 新規ユーザーは FREE 開始(= AI 停止)
- 既存ユーザーへの影響なし(Tenant.plan は維持される)
