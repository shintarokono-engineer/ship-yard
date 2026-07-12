# ADR-014 Twitter (X) 連携 運用 runbook(MVP:Web Intent 方式)

MVP は **Web Intent 方式**(X API を叩かない)を採用しています。運用上ほぼやることは無く、次にやることも僅かです。v1.x で API 版に戻す時の runbook は本ファイル末尾に旧版として残しています。

## 0. 前提

- インフラ側の設定(X Developer Portal / Secrets Manager / Redis)は **不要**
- ユーザーは各自の X アカウントで X 側にログインしていれば投稿できる
- Shipyard 側は投稿内容(280 字以内)を Web Intent URL のクエリパラメータに埋めて新規タブで開くだけ

## 1. 動作確認

- [ ] 任意の Announcement を作成 → AI 文面生成
- [ ] TwitterDeliveryCard の「**X で投稿する**」ボタンをクリック → 新規タブで X の投稿画面が開く
- [ ] X 画面で「ツイートする」を押して実際に投稿
- [ ] Shipyard に戻り「**送信完了**」ボタンを押す → 確認 dialog → 「送信完了とする」で `Delivery.status = SENT` 記録
- [ ] DB で `Delivery.status = SENT` / `sentAt` セット / `externalRef = null` を確認

## 2. 監視すべき指標

Web Intent 方式では BE 側から見える情報は最小限:

| 指標 | データソース | 意味 |
|---|---|---|
| `Delivery.status = SENT`(Twitter channel)件数 / 日 | DB | ユーザーがどれだけ「送信完了」を押しているか |
| `Delivery` 状態が DRAFT で滞留する件数 | DB | X で投稿はしたが Shipyard 側で「送信完了」を押していないユーザー(UX 課題の指標) |

X API 側の rate limit / エラー率は Shipyard から観測不能(X 側の Free Tier 個人枠での投稿になるため)。

## 3. トラブルシューティング

### 「X で投稿する」ボタンでタブが開かない

- ブラウザのポップアップブロッカーを疑う。 X の投稿画面は `target="_blank"` + `rel="noopener noreferrer"` で開くため、ポップアップ制限に引っ掛かる場合がある
- リンク右クリック → 新規タブで開く で代替

### X 側の投稿画面で「アカウント選択」が出る

- ブラウザ側で複数 X アカウントにログインしている場合の X の標準挙動。ユーザーが投稿元アカウントを選択して送信

### 「送信完了」ボタンで 401 / 403

- 401:Clerk セッション切れ、再ログイン
- 403:テナントへの所属権限なし、`isWriterRole` 相当のロールが必要

## 4. v1.x で本格 API 版に戻す時に必要になる作業(参考)

以下は「今は不要、v1.x で予約投稿 / スレッド投稿 / 効果計測を実装する時に再度必要になる」項目です。詳細な旧手順は git log で `apps/api/src/integrations/twitter/` を書いていた時点(2026-06 前後)の版を参照。

- X Developer Portal で本番アプリを作成、Basic プラン($200/月)を契約
- `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` / `TWITTER_REDIRECT_URI` を発行 → env に反映
- `TWITTER_TOKEN_ENCRYPTION_KEY` を `openssl rand -base64 32` で生成
- Upstash Redis を再度用意(OAuth state 保管、5min TTL)
- 削除した 3 モジュール(`apps/api/src/integrations/twitter/` / `apps/api/src/common/crypto/` / `apps/web/src/app/w/[slug]/settings/integrations/`)を復元、`TwitterAccount` model + migration を再作成
- `AnnouncementService.executeDelivery` の Twitter branch を Web Intent → X API 呼び出しに戻す
- `TwitterDeliveryCard` の「X で投稿する」+「送信完了」ボタンを、単一「X に投稿」ボタン(BE 経由で実投稿)に戻す

## 関連リンク

- ADR-014: `docs/adr/014-multi-channel-announcement.md`(§ステータス に 2026-07-12 追記)
- Migration: `packages/db/prisma/migrations/20260712060000_remove_twitter_account/migration.sql`
