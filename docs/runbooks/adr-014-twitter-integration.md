# ADR-014 Twitter 連携 運用 runbook

このランブックは ADR-014「マルチチャネル告知配信」 で導入した Twitter (X) 連携機能を本番運用するために必要な手作業をまとめたものです。コード実装は `feature/adr-014-fe-tasks-15-19` ブランチで完結しています(Day 56-59 BE + FE 一式)。

## 0. 前提

- X Developer Portal へのアクセス権(本番用 App は別途作成)
- 本番環境 Secrets Manager(AWS)更新権限
- Upstash アカウント(OAuth state 保管用 Redis)
- `apps/api` の本番デプロイ権限(env 反映 + 再起動)

## 1. X 開発者ポータルで本番用アプリを登録

> X 開発者ポータル(Developer Portal)は英語 UI ですが、ブラウザの Google 翻訳などで日本語表示にする方や、既存の日本語版画面キャプチャで確認する方向けに、以下は **「日本語表示名(英語表記)」** の併記形式で記載します。

### 1.1 アプリ作成

- [ ] https://developer.twitter.com/ja/portal/dashboard へアクセス(URL 末尾を `/en/` → `/ja/` に変えると日本語表示のダッシュボードに切り替わります)
- [ ] 左メニュー **「プロジェクトとアプリ」(Projects & Apps)** → 対象プロジェクト → **「+ アプリを追加」(+ Add App)** をクリック
  - **アプリ名(App name)**: `Shipyard Production`(local / staging とは別アプリにする)
  - **ユースケース(Use case)**: `組織向けのツール構築 / 分析共有`(Building tools or sharing analytics for an organization)
- [ ] 作成完了後、アプリの **「設定」(Settings)** タブを開き、**「ユーザー認証設定」(User authentication settings)** の **「編集」(Set up / Edit)** をクリックし、以下を有効化:
  - **アプリ権限(App permissions)**: **「読み取りと書き込み」(Read and write)**
  - **アプリの種類(Type of App)**: **「機密クライアント」(Confidential client)** — Web App を選択
  - **アプリ情報(App info)**:
    - **コールバック URI / リダイレクト URL(Callback URI / Redirect URL)**:
      - 本番: `https://api.shipyard.app/webhooks/twitter/callback`
      - staging: `https://api-staging.shipyard.app/webhooks/twitter/callback`
    - **ウェブサイトの URL(Website URL)**: `https://shipyard.app`
    - **利用規約 URL(Terms of service)** / **プライバシーポリシー URL(Privacy policy)**:未整備なら公開前に用意し記入
- [ ] **「保存」(Save)** を押すと、**「クライアント ID(Client ID)」** と **「クライアントシークレット(Client Secret)」** が 1 度だけ表示される
- [ ] 表示された両者を **AWS Secrets Manager** に格納(平文を git / Slack に貼らない)
  - secret 名: `shipyard/prod/twitter`
  - keys:
    - `TWITTER_CLIENT_ID`
    - `TWITTER_CLIENT_SECRET`

> ⚠️ **クライアントシークレット** は保存画面を閉じると再表示できません。閉じる前に必ず控える(または Secrets Manager に登録)こと。紛失時は同画面の **「シークレットを再生成」(Regenerate)** で再発行が必要。

### 1.2 プランと利用制限の確認

Shipyard の X 連携は **X API v2** を使用するため、開発者ポータル左メニュー **「製品」(Products)** → **「Free」** の tier で以下の月次上限が Shipyard アプリ全体に適用されます(全ユーザーの合算):

| プラン | 月額 | ツイート投稿(POST /2/tweets) | 読み取り(GET /2/users/me 等) |
|---|---|---|---|
| **Free** | $0 | **500 回 / 月** | **100 回 / 月** |
| **Basic** | $200/月(約 ¥30,000) | 3,000 回 / 月 | 50,000 回 / 月 |
| Pro | $5,000/月 | 300,000 回 / 月 | 1M 回 / 月 |

- Shipyard が消費する内訳:
  - ユーザーの X アカウント連携時に **GET /2/users/me** を 1 回(read × 1)
  - ユーザーが「X に投稿」ボタンを押した際に **POST /2/tweets** を 1 回(post × 1)
- **MVP 公開時は Free tier で開始し、月 400 posts / 80 reads に近づいたら Basic $200/月 へ移行**する運用方針
- 上限超過時は X API から 429 が返り、Shipyard 側では `Delivery.status = FAILED` + `error` に「今月の X 配信上限に達しました」文言を保存する挙動(既存の TwitterApiError ハンドリングでカバー)

## 2. Twitter token 暗号化用 master key の発行

### 2.1 master key 生成

- [ ] ローカルで生成:
  ```bash
  openssl rand -base64 32
  ```
  出力例: `Zk9LcWVtN2VwSVZTRGFNd0pveTRpRk9ZL2hYUk5pVE9HQ3IxQUd4SHlIZz0=`

### 2.2 Secrets Manager に格納

- [ ] AWS Secrets Manager の secret(`shipyard/prod/twitter`)に追記:
  - `TWITTER_TOKEN_ENCRYPTION_KEY`(上記で生成した base64-encoded 32 bytes)

### 2.3 鍵ローテーション運用(初期は手動、v1.x で自動化)

**前提**:`TokenEncryptionService`(`apps/api/src/common/crypto/`)は AES-256-GCM で `iv || tag || ciphertext` を base64url エンコードして DB に保存。master key 1 本で全テナントの `TwitterAccount.accessToken` / `refreshToken` を暗号化。

**ローテーション手順**:
1. 新しい master key を `openssl rand -base64 32` で生成
2. 旧 key で復号 → 新 key で再暗号化する一回限りのジョブを実行(未実装、v1.x で migration 化)
3. Secrets Manager の `TWITTER_TOKEN_ENCRYPTION_KEY` を新 key で上書き
4. API を再起動

> 注:MVP では「token 漏洩を疑う事象が起きたら」 のみ実行する想定。日次 / 月次の定期ローテーションは v1.x で自動化検討(`docs/adr/014` フォローアップ)。

## 3. Upstash Redis(OAuth state / PKCE verifier 保管)

### 3.1 Database 作成

- [ ] https://console.upstash.com → **「+ Create Database」**
  - Name: `shipyard-prod-twitter-oauth`
  - Type: **Regional**(Tokyo)
  - Eviction: `noeviction`(TTL=5min で自動削除されるため OOM のリスクは低い)
- [ ] **Free tier(10,000 commands/day)で十分**(OAuth は 1 連携 = 2 commands)。スケール時に Pay-As-You-Go へ
- [ ] **REST API** の URL + Token を取得

### 3.2 Secrets Manager に追記

- [ ] `shipyard/prod/twitter` に追加:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`

## 4. 本番環境への env 反映

API インスタンス(ECS / Vercel / etc.)の環境変数に以下を設定:

| key | 値 |
|---|---|
| `TWITTER_TOKEN_ENCRYPTION_KEY` | §2.1 で生成、Secrets Manager 参照 |
| `TWITTER_CLIENT_ID` | §1.1 で発行 |
| `TWITTER_CLIENT_SECRET` | §1.1 で発行 |
| `TWITTER_REDIRECT_URI` | `https://api.shipyard.app/webhooks/twitter/callback`(staging は別) |
| `UPSTASH_REDIS_REST_URL` | §3.1 で取得 |
| `UPSTASH_REDIS_REST_TOKEN` | §3.1 で取得 |

設定後、 API を再起動して boot ログに以下が出ないことを確認:

```
[WARN] TWITTER_TOKEN_ENCRYPTION_KEY が未設定です(boot 時警告、Day 49 Clerk パターン)
[WARN] UPSTASH_REDIS_REST_URL が未設定です
[WARN] TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET が未設定です
```

未設定だと使用時に 503 を返す設計(Day 49 Clerk パターン踏襲)。 boot 自体は止まらないが警告ログは必ず潰す。

## 5. 動作確認(本番)

### 5.1 連携フロー疎通

- [ ] OWNER ユーザーで `/w/{slug}/settings/integrations` を開く
- [ ] 「X アカウントを連携」 リンクをクリック
- [ ] X の OAuth 認可画面に遷移することを確認(URL に `state` + `code_challenge` パラメータ)
- [ ] 「Authorize app」 を押す
- [ ] `/w/{slug}/settings/integrations?status=connected` 等に戻ってくることを確認
- [ ] DB で `TwitterAccount` 行が 1 件追加されていることを確認
  ```sql
  SELECT id, handle, "xUserId", "createdById", "expiresAt", LENGTH("accessToken") AS token_len
  FROM "TwitterAccount" WHERE "tenantId" = '<your-tenant-id>';
  ```
- [ ] `token_len` が ~200 文字(暗号化後の base64url)であること、平文 token が混じっていないことを確認

### 5.2 投稿フロー疎通

- [ ] 任意のプロジェクトで Announcement を新規作成
- [ ] AI 多チャネル文面生成(`POST /announcements/:id/generate`)を実行
- [ ] Twitter Delivery の「X に投稿」 を押す
- [ ] X タイムラインに実際に投稿されていることを確認
- [ ] DB で `Delivery.status = SENT` / `externalRef`(tweet ID)が記録されていることを確認
- [ ] `AIUsage` テーブルに `Feature.ANNOUNCEMENT_GEN` が 4 cr で記録されていることを確認

## 6. 監視・トラブルシューティング

### 6.1 監視すべき指標(ADR-014 §フォローアップ)

| 指標 | 閾値の目安 | 対応 |
|---|---|---|
| `Delivery.status = FAILED` 比率(Twitter channel) | > 10% / 日 | X API のステータスページを確認、 PostTweet エラー詳細(`error` 列)を調査 |
| `TwitterAccount.expiresAt` 経過後の再連携率 | < 80% | refresh フローの失敗(invalid_grant 等)を疑う、 通知 UI 改善検討 |
| `ANNOUNCEMENT_GEN` 1 回あたり平均 AI コスト | > 6 円 / 回 | Sonnet 4 のトークン消費を確認、 max_tokens を調整 |
| Upstash Redis commands/day | > 8,000 / 日 | OAuth state TTL の見直し or Pay-As-You-Go プラン移行 |

### 6.2 典型的なエラーと対応

#### 連携時に「X アカウント連携 URL を組み立てられませんでした」

- 原因:`NEXT_PUBLIC_API_URL` 未設定(FE)
- 対応:Vercel(or 本番ホスト)の env に `NEXT_PUBLIC_API_URL` を追加 → 再デプロイ

#### 連携時に 503 Service Unavailable

- 原因:`UPSTASH_REDIS_REST_URL` / `TOKEN` 未設定、 または Redis 接続失敗
- 対応:Secrets Manager + API env を確認、 Upstash 側の status ページもチェック

#### 連携時に 400 invalid_grant / invalid_client

- 原因:`TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` 不整合、 もしくは `TWITTER_REDIRECT_URI` が X Developer Portal に登録されていない
- 対応:Portal の Callback URL 設定を確認、 env を再投入

#### 投稿時に「X 投稿で予期しないエラーが発生しました」(`Delivery.error`)

- BE ログで `TwitterApiError` の `userMessage` / response body を確認
- 典型ケース:
  - 280 字超過(FE バリデーションすり抜け):BE で reject されるべき
  - X API rate limit:24h クールダウン後再試行
  - アカウント suspend:ユーザーに X 側状況確認を依頼、 Shipyard 側は切断 + 再連携を案内

#### 「アカウント未連携」 403(投稿実行時)

- 原因:`TwitterAccount` が削除済 or `tenantId` 不一致
- 対応:設定タブで再連携を案内

### 6.3 token 漏洩を疑う事象が発生した場合

1. **全アカウント緊急 revoke**:
   ```sql
   SELECT id, handle, "tenantId" FROM "TwitterAccount";
   -- 各 account に対して BE 側 revoke 関数を呼び出す内部スクリプトを準備中(v1.x 自動化)
   -- 当面は手動で X Developer Portal から App を revoke することで全 token を無効化可能
   ```
2. X Developer Portal で **App credentials を rotate**(`TWITTER_CLIENT_SECRET` 再発行)
3. Secrets Manager の **`TWITTER_TOKEN_ENCRYPTION_KEY`** を rotate(§2.3 ローテーション手順)
4. 全テナントに再連携の案内通知を出す

## 7. 利用規約への明記事項(法務確認)

ADR-014 §結果(悪い影響)で「X API のアカウントサスペンドリスク」 が挙げられているとおり、 利用規約に以下を明記:

- 投稿内容はユーザー個人の責任
- Shipyard は X API の規約違反に該当する投稿(誹謗中傷 / スパム / 自動投稿の禁止カテゴリ等)が発生した場合、 該当アカウントの連携を予告なく切断することがある
- X API の仕様変更により本機能が予告なく停止する可能性がある

## 8. v1.x で対応する運用改善

- `TwitterAccount` の `expiresAt` 経過直前に通知(現状はユーザーが投稿失敗で気づく)
- 全アカウント緊急 revoke の内部スクリプト化(現状は手動 SQL + Portal 操作)
- master key の自動ローテーション(現状は手動)
- 複数アカウント連携時の投稿元アカウント選択 UI(現状は連携順最古固定)

## 関連リンク

- ADR-014: `docs/adr/014-multi-channel-announcement.md`
- Spec doc: `docs/superpowers/specs/2026-05-28-multi-channel-publishing-design.md`(セキュリティ詳細はここに集約)
- BE 実装: `apps/api/src/integrations/twitter/` + `apps/api/src/common/crypto/`
- FE 実装: `apps/web/src/app/w/[slug]/settings/integrations/`
