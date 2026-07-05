# ADR-014 リリース時チェックリスト(Day 59 公開)

このランブックは ADR-014「マルチチャネル告知配信」(Twitter + 自前ブログ MVP)を本番リリースするために必要なコード以外の手作業をまとめたものです。コード変更は `feature/adr-014-fe-tasks-15-19` ブランチで実装済(Day 56-57 BE + Day 58-59 FE 一式 + セルフレビュー指摘 17 件修正)。

> 関連 runbook: 連携の継続運用は `docs/runbooks/adr-014-twitter-integration.md` を参照。

## 0. 前提

- 本番 / staging の AWS Secrets Manager 更新権限
- 本番 DB に対する migration 適用権限(`prisma migrate deploy`)
- X Developer Portal の本番アプリ作成権限
- Vercel(or 本番 Web ホスト)の env 設定権限
- 本番 API ホスト(ECS / etc.)の env 設定 + 再デプロイ権限

## 1. インフラ準備(`docs/runbooks/adr-014-twitter-integration.md` に詳細)

### 1.1 X Developer Portal: 本番用 App 作成

- [ ] §1.1 の手順に沿って本番アプリを作成、OAuth 2.0 / Confidential client / Read+Write / callback URL を設定
- [ ] `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` を発行

### 1.2 暗号化 master key 発行

- [ ] `openssl rand -base64 32` で 32 バイト鍵を生成
- [ ] AWS Secrets Manager(`shipyard/prod/twitter`)に `TWITTER_TOKEN_ENCRYPTION_KEY` として格納

### 1.3 Upstash Redis(OAuth state 保管)作成

- [ ] Tokyo region で Database 作成(Free tier で十分)
- [ ] REST URL + Token を取得し Secrets Manager に追加

## 2. env 反映

### 2.1 API(本番 / staging)

以下を本番ホストの env に追加:

| key | 値 |
|---|---|
| `TWITTER_TOKEN_ENCRYPTION_KEY` | §1.2 で生成、Secrets Manager 参照 |
| `TWITTER_CLIENT_ID` | §1.1 |
| `TWITTER_CLIENT_SECRET` | §1.1 |
| `TWITTER_REDIRECT_URI` | `https://api.shipyard.app/webhooks/twitter/callback`(本番) |
| `UPSTASH_REDIS_REST_URL` | §1.3 |
| `UPSTASH_REDIS_REST_TOKEN` | §1.3 |

- [ ] 反映後 API を再起動し、boot ログで以下が**出ないこと**を確認:
  - `[WARN] TWITTER_TOKEN_ENCRYPTION_KEY が未設定`
  - `[WARN] UPSTASH_REDIS_REST_URL が未設定`
  - `[WARN] TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET が未設定`

### 2.2 Web(Vercel)

| key | 値 |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.shipyard.app`(本番)/ staging は別 |

- [ ] Vercel ダッシュボードで env を設定 → 再デプロイ
- [ ] `/w/{slug}/settings/integrations` で「X アカウントを連携」 リンクが正しい URL(`https://api.shipyard.app/.../authorize`)になっていることを DevTools で確認

## 3. DB migration 適用

ADR-014 では 2 件の migration が新規追加されています(Day 56 時点で適用済 = staging / 本番未適用なら以下を実施):

- [ ] `20260529024553_add_announcement_delivery_blogpost_twitteraccount`(4 model + index)
- [ ] `20260529025519_add_feature_announcement_gen`(`Feature.ANNOUNCEMENT_GEN` enum 値追加)
- [ ] `20260529121018_remove_announcement_doc_types`(DocType から 4 値削除、§9.12.3)

```bash
# 本番に対して(慎重に)
DATABASE_URL='postgresql://...' pnpm --filter @shipyard/db prisma migrate deploy
```

- [ ] 適用後、`prisma migrate status` で「Database schema is up to date!」 を確認
- [ ] 以下を SQL で確認:
  ```sql
  -- 4 model の存在
  SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename IN ('Announcement','Delivery','BlogPost','TwitterAccount');
  -- DocType enum が縮小されていること
  SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname='DocType');
  -- → README, OTHER のみ
  -- Feature enum に ANNOUNCEMENT_GEN が含まれること
  SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname='Feature');
  -- → ANNOUNCEMENT_GEN が含まれる
  ```

## 4. コード反映(PR マージ)

- [ ] PR `feature/adr-014-fe-tasks-15-19` → `main` を作成
  - https://github.com/shintarokono-engineer/ship-yard/pull/new/feature/adr-014-fe-tasks-15-19
  - PR description に以下を明記:
    - 6 コミット内訳(Task 15-19 + 修正)
    - react-doctor 結果(72/100、既存ダイアログパターン踏襲のため未修正、別 PR で全体リファクタ検討)
    - セルフレビュー報告(`.claude/output/reviewing-own-changes/2026-06-20-2251-adr-014-fe-tasks-15-19.md`)
    - 関連 runbook(`docs/runbooks/adr-014-twitter-integration.md`, 本ファイル)
- [ ] CI(type-check / lint / build / vitest)が全て green であることを確認
- [ ] レビュー承認後 main にマージ → 自動デプロイ
- [ ] Vercel / API ホストの本番デプロイ完了を確認

## 5. 公開後動作確認(本番)

### 5.1 連携フロー疎通

- [ ] OWNER ユーザーで `/w/{slug}/settings/integrations` を開く
- [ ] 「X アカウントを連携」 → X の OAuth 認可画面 → 「Authorize app」 → 戻り
- [ ] DB で `TwitterAccount` 行が 1 件追加、token が base64url 形式(平文混入なし)を確認

### 5.2 告知配信フロー疎通

- [ ] 任意のプロジェクトで Announcement を新規作成
- [ ] AI 多チャネル文面生成(Sonnet 4)で Twitter + Blog のドラフト生成を確認
- [ ] Twitter Delivery を編集 → 「X に投稿」 を押下
- [ ] X タイムラインに実投稿されていることを確認、`Delivery.status = SENT` / `externalRef`(tweet ID)を確認
- [ ] Blog Delivery を編集 → 「公開する」 を押下
- [ ] `/p/{slug}/{projectId}/blog/{postSlug}` で公開ページを未認証ブラウザから閲覧、JSON-LD `BlogPosting` が含まれていることを DevTools で確認
- [ ] `sitemap.xml` に公開ブログ URL が追加されていることを確認

### 5.3 AI クレジット消費確認

- [ ] `GET /workspaces/{slug}/usage` で `byFeature` 配列に `ANNOUNCEMENT_GEN` が 4 cr で記録されていることを確認

### 5.4 セキュリティ確認

- [ ] 連携設定タブの `<a href>` に `rel="noopener noreferrer"` が含まれることを DevTools で確認
- [ ] 公開ブログ本文に `[link](javascript:alert(1))` を含むテスト記事を一時的に公開し、リンクが空 href にサニタイズされて XSS が発火しないことを確認(検証後即削除)
- [ ] `Delivery.status = FAILED` の error メッセージにユーザー向け文言が入っていることを抜き取りで確認

## 6. 監視・運用

`docs/runbooks/adr-014-twitter-integration.md` §6 の指標と閾値で監視:

- [ ] CloudWatch / Sentry で `TwitterApiError` の発生率ダッシュボードを作成
- [ ] Upstash Redis の commands/day を週次レビュー(Free tier 上限 10,000)
- [ ] AI コスト(`AIUsage` テーブルの `ANNOUNCEMENT_GEN` 月次合計)を週次レビュー

## 7. ユーザーへの公開告知

- [ ] Shipyard 自身の Twitter / Zenn / マーケ LP で「マルチチャネル告知配信」 機能の公開を告知(ADR-014 §結果「悪い影響:Subscriber 0 で公開する選択(v1.x 送り)による初回告知の弱さ」 への対策として、Day 52-53 既存予定どおり手動実施)
- [ ] 利用規約に以下を追記済(法務確認後):
  - 投稿内容はユーザー責任
  - X API 規約違反時は予告なく連携切断する場合あり
  - X API 仕様変更で本機能が予告なく停止する可能性あり
- [ ] Help / FAQ:「Twitter 連携の追加 / 切断方法」「投稿失敗時の対処」「ブログ公開 URL の SEO 設定」 のページを準備(MVP では最小 3 件)

## 8. ロールバック手順(緊急時)

### 8.1 機能フラグでの即時無効化

ADR-014 機能にフィーチャーフラグは設定していないため、最も早い無効化手段:

- API 側で `TWITTER_CLIENT_ID` / `UPSTASH_REDIS_REST_URL` を空に上書き → 連携追加 / 投稿実行が 503 で返るようになる(Day 49 Clerk pattern)
- これにより新規連携 / 投稿はブロック、既存連携 / 公開済みブログは閲覧可能のまま

### 8.2 完全ロールバック(コード revert)

- [ ] PR を revert 用 PR で巻き戻す(`git revert <merge-commit>`)
- [ ] 既存 DB row(`Announcement` / `Delivery` / `BlogPost` / `TwitterAccount`)は残るため、必要に応じて手動で空に
- [ ] migration の down は提供していないため、enum 縮小(DocType / Feature)はそのまま残る(`Feature.ANNOUNCEMENT_GEN` を使った AIUsage 行は影響なし)

## 関連リンク

- ADR-014: `docs/adr/014-multi-channel-announcement.md`
- Spec doc: `docs/superpowers/specs/2026-05-28-multi-channel-publishing-design.md`
- Twitter 連携運用 runbook: `docs/runbooks/adr-014-twitter-integration.md`
- セルフレビュー報告: `.claude/output/reviewing-own-changes/2026-06-20-2251-adr-014-fe-tasks-15-19.md`
- react-doctor 結果: `.claude/output/running-react-doctor/2026-06-22-1835.md`
