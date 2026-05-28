# Clerk Webhook トラブルシューティング

このランブックは §9.10 Clerk webhook(Day 49 実装)の運用時に遭遇しうる典型的な問題と復旧手順をまとめたものです。実装本体は `apps/api/src/webhooks/clerk-webhook.service.ts` + `apps/api/src/webhooks/webhooks.controller.ts` + `apps/api/src/workspaces/workspaces.service.ts` の JIT、データは `ClerkWebhookEvent` テーブル + `User.deletedAt`(2026-05-28 実装)。

## 0. 概要

Clerk → Shipyard DB へのユーザー同期は **2 経路** で担保しています。

| 経路 | トリガー | 用途 |
| --- | --- | --- |
| **Webhook(主)** | Clerk が `user.created` / `user.updated` / `user.deleted` を `POST /webhooks/clerk` に配信 | 正規同期、Idempotency は `ClerkWebhookEvent.svixMessageId @unique` |
| **JIT プロビジョニング(副)** | `WorkspacesService.create` 内で `User` が未存在なら Clerk SDK `users.getUser()` で取得し upsert | Webhook 未到達・遅延時のフォールバック |

下記の事象は「主経路 / 副経路 / セットアップ / ブラウザ状態」のどこかに起因します。

---

## 1. ローカル開発セットアップ

### 1.1 ngrok の準備(初回のみ)

```sh
# インストール
brew install --cask ngrok

# 認証トークン登録(https://dashboard.ngrok.com/get-started/your-authtoken)
ngrok config add-authtoken <YOUR_TOKEN>
```

> ngrok v3 以降、匿名利用は不可。`ERR_NGROK_4018` が出る場合は authtoken 未設定。

### 1.2 ローカル DB の migration 適用確認

```sh
cd packages/db
pnpm exec prisma migrate status
```

→ `20260528042547_add_clerk_webhook_event` が `Applied` であること(Day 49 マイグレーション)。

### 1.3 ローカル API 起動 + 公開

```sh
# ターミナル A: API
pnpm --filter @shipyard/api start:dev

# ターミナル B: ngrok 公開
ngrok http 4000
# → https://xxx.ngrok-free.app の URL を控える
```

### 1.4 Clerk Dashboard で Webhook Endpoint 登録

1. https://dashboard.clerk.com → Shipyard の **Development** インスタンス
2. 左サイドバー **Configure** → **Webhooks** → **+ Add Endpoint**
3. **Endpoint URL** = `<NGROK_URL>/webhooks/clerk`
4. **Message Filtering** で **3 イベント全てにチェック**:
   - ✅ `user.created`
   - ✅ `user.updated`
   - ✅ `user.deleted`
5. **Create** → 詳細画面で **Signing Secret**(`whsec_...`)を **Click to reveal** → コピー

### 1.5 `.env.local` に投入 + API 再起動

`apps/api/.env.local`:

```env
CLERK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

> NestJS `start:dev` は `.env.local` の変更を HMR で拾わないため、**Ctrl+C で停止 → 再起動が必須**。

起動ログに `CLERK_WEBHOOK_SECRET is not set; ...` の WARN が **出ないこと** を確認。

### 1.6 疎通確認

Clerk Dashboard → Webhook 詳細 → **Testing** タブ → `user.created` を Send → Status `Succeeded` (200) になることを確認。

---

## 2. 既知の事象と復旧手順

### 2.1 🔴 `500 Webhook endpoint is not available` が返る

**原因**: `CLERK_WEBHOOK_SECRET` が API プロセスに読み込まれていない。

**典型ログ(API 側)**:

```
ERROR [WebhooksController] POST /webhooks/clerk invoked but CLERK_WEBHOOK_SECRET is not configured
```

**復旧**:

1. `grep -n CLERK_WEBHOOK_SECRET apps/api/.env.local` で値が `whsec_...` 形式で存在することを確認
2. `node -e "require('dotenv').config({path:'apps/api/.env.local'}); console.log(process.env.CLERK_WEBHOOK_SECRET?.length)"` で文字数 > 0 を確認(値の前後にクォート・空白が無いこと)
3. NestJS を **完全停止 → 再起動**(HMR では拾わない)
4. 起動 WARN が出ないことを確認

**仕様メモ**: レスポンス body は意図的に env 名(`CLERK_WEBHOOK_SECRET`)を漏らさない汎用メッセージ。詳細はサーバーログ側にのみ出る。

### 2.2 🟡 Webhook が API に届かない / `ClerkWebhookEvent` に記録なし

**原因(候補・優先順)**:

1. **Subscribe events 設定漏れ** — Clerk Endpoint の Message Filtering で `user.created` 等にチェックが入っていない。「Send example message」は Subscribe 設定を **無視して** 送れるため、テストでは届くが実イベントでは届かない、という挙動になる
2. ngrok URL を更新したまま Clerk Dashboard に古い URL が登録されている(ngrok 無料プランの URL は再起動で変わる)
3. ngrok プロセスが落ちている

**復旧**:

1. Clerk Dashboard → Endpoint 詳細 → **Message Filtering** で 3 イベントにチェック → Save
2. **Message attempts** タブで配信履歴を確認(該当時刻に行があるか / Status が Succeeded か)
3. ngrok の Web Inspector(http://localhost:4040)で POST が来ているか確認
4. 来ていなければ `ngrok http 4000` の URL を Clerk Endpoint の URL と突き合わせて修正

### 2.3 🟡 `user.created` が発火しない(既存 Clerk ユーザーの再サインアップ)

**原因**: 同じメールアドレス・OAuth プロバイダで **過去に Clerk にユーザー登録済**。今の操作は Clerk 内部で「サインイン」扱いとなり、`user.created` は発火しない(`session.created` のみ。これは購読していない)。

**症状**:

- サインアップ画面の後にスピナーが回り続けるが、Webhook ログにもサーバーログにも何も来ない
- 既存ユーザーで `User` 行が手動 INSERT 等で存在していると JIT も走らないため一見動いてしまう

**復旧 / 検証**:

- 検証目的なら **Clerk Dashboard → Users → 該当ユーザー削除 → シークレットウィンドウで再サインアップ**(2.6 と併発する点に注意)
- もしくは **未使用の別 Google アカウント / Gmail エイリアス**(`+test` 記法)でサインアップ

### 2.4 🟡 `ClerkWebhookEvent` に `PROCESSED` 記録はあるが `User` 行が作られない

**典型ログ**:

```
WARN [ClerkWebhookService] Clerk user user_xxx has no primary email address; skipping upsert
```

**原因**:

- Clerk Dashboard の「Send example message」サンプルペイロードは `data.email_addresses = []` で送られることがある
- もしくは Clerk アプリケーションのサインアップ設定で **Email を必須にしていない**(SMS-only / Username-only)

**復旧**:

- Webhook 経路自体は正常 + Idempotency 仕様通りなので、`ClerkWebhookEvent.status=PROCESSED` で完結し再送ループにならないのは設計どおり
- 実 User 行を作りたければ:Clerk Dashboard → **User & Authentication** → **Email, Phone, Username** で **Email address を Required + Used for sign-in** に設定
- 検証は **Send example ではなく実ユーザー作成**(Dashboard の +Create user か OAuth サインアップ)で行う

### 2.5 🟢 Prisma Studio に `ClerkWebhookEvent` / `User.deletedAt` が見えない

**原因**: Prisma Studio が **migration より前に起動済み** で、起動時のスキーマをキャッシュしている。

**復旧**:

```sh
pkill -f "prisma studio"
cd packages/db
pnpm exec prisma studio
```

> 念のため Studio 起動時のターミナルに表示される DATABASE_URL が現在の作業 DB と一致するかも確認(別 worktree / 別 DB に繋がっていないか)。

### 2.6 🟡 User 削除 → 同 Clerk アカウントで再サインアップ → `Uncaught FetchError` で白紙

**症状**:

- Clerk Dashboard で当該ユーザーを削除した直後、**通常ブラウザ**(普段使い)で「Continue with Google」を押す
- Google 画面に遷移すらせず白紙。Console に `Uncaught (in promise) {name: 'FetchError'}` が出る
- URL は `http://localhost:3000/sign-up#/sso-callback?redirect_url=...`

**原因**: Clerk SDK は LocalStorage / IndexedDB / `*.clerk.accounts.dev` ドメインの Cookie に **クライアントトークン**(`__clerk_db_jwt` 等)とセッション履歴を保存する。User 削除前のトークンが残ったまま再サインアップを試みると、SDK が「既存セッションを復元」しようとして削除済みユーザーを参照 → サーバーが整合性エラーを返し SDK 内部で `FetchError` を投げて中断。`localhost:3000` の Cookie だけ削除しても LocalStorage / IndexedDB と Clerk ドメイン Cookie は残るため発生する。

**復旧(優先順)**:

1. **シークレットウィンドウ / プライベートウィンドウで再試行**(`Cmd+Shift+N`)→ 永続データが完全分離されるため確実に動く
2. 通常ウィンドウで復旧したい場合:
   - DevTools → **Application** → **Storage** → **Clear site data**(全項目 ON)
   - アドレスバーで `https://<your-clerk-frontend-api>.clerk.accounts.dev/` を開く → 同じ手順
   - `http://localhost:3000` に戻ってサインアップ再試行
3. ブラウザ拡張(uBlock / Privacy Badger 等)を疑う場合は拡張を一旦 OFF で切り分け

**予防策(開発運用)**:

- **User 削除 → 再サインアップの検証は必ずシークレットウィンドウで行う**
- 開発専用のブラウザプロファイル(Chrome の「ユーザーを追加」)を作って本業のブラウザと分離する
- これは Clerk SDK 側の設計上の制約で、Day 49 の Shipyard 側コードに不具合はない

### 2.7 🟢 `400 Missing one of svix-id / svix-timestamp / svix-signature headers`

**原因**: 手動 curl 等で svix ヘッダーを 1 つでも欠いた呼び出し。

**判定**: 仕様通り。Day 49 の防御線(`webhooks.controller.ts` 内のチェック)が機能している証拠。Clerk からの正規配信ではこの 3 ヘッダーは必ず付くため、エラー出現時は **未認可呼び出し or テスト目的** とみなしてよい。

### 2.8 🟢 `400 Clerk webhook signature verification failed`

**原因**:

- 改ざんされたペイロード
- `CLERK_WEBHOOK_SECRET` の値が Clerk Dashboard の Signing Secret と一致しない(誤コピー / 別 Endpoint の値)
- svix-timestamp が **±5 分** の許容範囲外(古すぎる payload を持ち回すリプレイ攻撃)

**復旧**:

- Clerk Dashboard で Endpoint の Signing Secret を再表示 → `.env.local` に貼り直し → API 再起動
- 複数 Endpoint がある場合、どちらの Signing Secret かを取り違えていないか確認

---

## 3. 本番環境セットアップ手順(Day 50-51 で実施予定)

### 3.1 Clerk Dashboard(Production インスタンス)で Webhook Endpoint 作成

- [ ] Production インスタンスを選択(Development と分離されている)
- [ ] **Configure** → **Webhooks** → **+ Add Endpoint**
- [ ] **Endpoint URL** = `<APP_BASE_URL>/webhooks/clerk`(本番ドメイン)
- [ ] **Subscribe**:`user.created` / `user.updated` / `user.deleted`
- [ ] **Signing Secret**(`whsec_...`)をメモ

### 3.2 AWS Secrets Manager に `CLERK_WEBHOOK_SECRET` 投入

- [ ] `infra/prod/secrets.tf` の管理シークレットに `CLERK_WEBHOOK_SECRET` キーが含まれているか確認(キー構造は IaC 管理、値は手動投入)
- [ ] AWS Console / CLI で `whsec_...` を投入
- [ ] App Runner サービスの env vars 連携(`apprunner.tf` の `runtime_environment_secrets`)に追加 → デプロイ

### 3.3 本番疎通テスト

- [ ] Clerk Dashboard の Webhook 詳細 → Testing で `user.created` Send → Status `Succeeded` (200)
- [ ] 本番 RDS の `ClerkWebhookEvent` テーブルに行が増えていることを確認
- [ ] Production アプリで実サインアップ(別メアド)→ `User` 行が作られることを確認

---

## 4. デバッグ用クエリ

### 4.1 直近の Webhook 受信履歴

```sh
docker compose exec postgres psql -U shipyard -d shipyard -c \
  "SELECT \"svixMessageId\", \"type\", \"status\", \"processedAt\" FROM \"ClerkWebhookEvent\" ORDER BY \"processedAt\" DESC LIMIT 10;"
```

### 4.2 User 同期状態(論理削除含む)

```sh
docker compose exec postgres psql -U shipyard -d shipyard -c \
  "SELECT \"id\", \"clerkUserId\", \"email\", \"name\", \"createdAt\", \"deletedAt\" FROM \"User\" ORDER BY \"createdAt\" DESC LIMIT 10;"
```

### 4.3 FAILED 状態の Webhook を抽出

```sh
docker compose exec postgres psql -U shipyard -d shipyard -c \
  "SELECT \"svixMessageId\", \"type\", \"processedAt\", \"payload\"->'data'->>'id' AS clerk_user_id FROM \"ClerkWebhookEvent\" WHERE \"status\"='FAILED' ORDER BY \"processedAt\" DESC;"
```

### 4.4 Webhook と User の整合性(Webhook 来てるが User 行が無いケース)

```sh
docker compose exec postgres psql -U shipyard -d shipyard -c \
  "SELECT cwe.\"payload\"->'data'->>'id' AS clerk_user_id, cwe.\"type\", cwe.\"status\", u.\"id\" AS user_id, u.\"deletedAt\" FROM \"ClerkWebhookEvent\" cwe LEFT JOIN \"User\" u ON u.\"clerkUserId\" = cwe.\"payload\"->'data'->>'id' WHERE cwe.\"type\" = 'user.created' ORDER BY cwe.\"processedAt\" DESC LIMIT 10;"
```

→ `user_id` が NULL の行は同期失敗を示す(2.4 に該当する可能性)。

---

## 5. 関連実装ファイル

- `apps/api/src/webhooks/webhooks.controller.ts` — `POST /webhooks/clerk` エンドポイント
- `apps/api/src/webhooks/clerk-webhook.service.ts` — 受信処理 + Idempotency + upsert / 論理削除
- `apps/api/src/auth/clerk-client.provider.ts` — Clerk Backend SDK の NestJS Provider(JIT 用)
- `apps/api/src/workspaces/workspaces.service.ts` — JIT プロビジョニング `ensureUser()`
- `apps/api/src/workspaces/membership.service.ts` — `deletedAt: null` で削除済みユーザー弾く認証ガード
- `apps/api/src/invitations/invitations.service.ts` — 招待受諾でも同様
- `packages/db/prisma/schema.prisma` — `User.deletedAt` + `ClerkWebhookEvent` モデル
- `packages/db/prisma/migrations/20260528042547_add_clerk_webhook_event/migration.sql`

## 6. 関連ドキュメント

- `docs/PROJECT_STATUS.md` §9.10 / Week 6 Day 49 行 — スコープと位置づけ
- `docs/runbooks/adr-012-release-checklist.md` — Stripe 連携の本番リリース手順(本番化の Day 50-51 で参照)
