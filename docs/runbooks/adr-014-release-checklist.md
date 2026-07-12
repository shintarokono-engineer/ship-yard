# ADR-014 リリース時チェックリスト

**2026-07-12 更新**:Twitter は Web Intent 方式に暫定移行(ADR-014 §ステータス参照)。X API 関連のインフラ準備は不要になりました。以下は Web Intent 方式 MVP 公開用の項目。

## 0. 前提

- 本番 DB に対する migration 適用権限(`prisma migrate deploy`)
- Web ホスティング(Vercel など)の env 設定権限
- API ホスティング(Railway / Render / ECS など)の env 設定 + 再デプロイ権限

## 1. DB migration 適用

ADR-014 関連で以下 4 件を本番に反映:

- [ ] `20260529024553_add_announcement_delivery_blogpost_twitteraccount`(4 model + index、初回)
- [ ] `20260529025519_add_feature_announcement_gen`(Feature.ANNOUNCEMENT_GEN 追加)
- [ ] `20260529121018_remove_announcement_doc_types`(DocType から 4 値削除)
- [ ] `20260712060000_remove_twitter_account`(Web Intent 移行で TwitterAccount 削除)

```bash
DATABASE_URL='postgresql://...' pnpm --filter @shipyard/db prisma migrate deploy
```

- [ ] `prisma migrate status` で「Database schema is up to date!」を確認
- [ ] Announcement / Delivery / BlogPost の 3 テーブル + TwitterAccount **無し** を SQL 確認

## 2. env 反映

### 2.1 API(本番 / staging)

Twitter 関連 env はすべて不要になりました。ADR-014 分の追加 env は無し。

### 2.2 Web

| key | 値 |
|---|---|
| `NEXT_PUBLIC_API_URL` | 本番 API の URL(例:`https://api.shipyard.app`) |

## 3. コード反映(PR マージ)

- [ ] `feature/*` ブランチを main にマージ → 自動デプロイ
- [ ] CI(type-check / lint / build / vitest)が green
- [ ] Vercel / API ホストのデプロイ完了確認

## 4. 公開後動作確認

### 4.1 Announcement + AI 生成

- [ ] 任意のプロジェクトで Announcement を新規作成
- [ ] AI 多チャネル文面生成(Sonnet 4)で Twitter + Blog のドラフト生成
- [ ] `AIUsage` テーブルに `ANNOUNCEMENT_GEN` が 4 cr で記録

### 4.2 Twitter Delivery(Web Intent)

- [ ] TwitterDeliveryCard の「**X で投稿する**」で新規タブが開く
- [ ] X 画面で送信 → 「**送信完了**」ボタン → `Delivery.status = SENT` を DB 確認

### 4.3 Blog Delivery + 公開ページ

- [ ] BlogDeliveryCard で「公開する」を押下
- [ ] `/p/{slug}/{projectId}/blog/{postSlug}` を未認証ブラウザで閲覧、JSON-LD `BlogPosting` を DevTools で確認
- [ ] `sitemap.xml` に公開ブログ URL が追加

### 4.4 セキュリティスポットチェック

- [ ] 公開ブログ本文に `[link](javascript:alert(1))` を含むテスト記事を仮公開 → リンクが空 href に無害化されて XSS が発火しないことを確認(検証後即削除)
- [ ] `Delivery.status = FAILED` の error メッセージにユーザー向け文言が入っていることを抜き取り確認

## 5. 監視・運用

- [ ] `Delivery.status = SENT`(Twitter channel)件数 / 日 のダッシュボード
- [ ] AI コスト(`AIUsage.ANNOUNCEMENT_GEN` 月次合計)を週次レビュー

## 6. ユーザーへの公開告知

- [ ] Shipyard 自身の X / Zenn / マーケ LP で「マルチチャネル告知配信」機能の公開を告知
- [ ] Help / FAQ:「X 投稿の使い方(Web Intent 方式)」「ブログ公開 URL の SEO 設定」

## 7. ロールバック(緊急時)

### コード revert

- [ ] `git revert <merge-commit>` で PR を巻き戻す(既存の Announcement / BlogPost 行は残る)

## 関連リンク

- ADR-014: `docs/adr/014-multi-channel-announcement.md`
- Twitter 連携運用 runbook: `docs/runbooks/adr-014-twitter-integration.md`
