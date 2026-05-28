# ADR-014: マルチチャネル告知配信(Twitter + ブログ + メール)アーキテクチャ

## ステータス

提案(2026-05-28、ブレストフェーズ — 詳細設計は継続中)

## 背景・問題

Shipyard の §1 提供価値の 4 つ目「**初期ユーザー獲得**」 を支援する具体機能として、ユーザーがプロダクトのリリース告知 / アップデート告知を **Shipyard 内から直接 Twitter / ブログ / メールへ一斉配信** できる機能を実装する。

既存の DRAFT_GEN(Day 29 で 6 種別に拡張済)では `TWEET` / `RELEASE_BLOG` / `EMAIL` の **ドラフト生成までは可能**だが、生成された Markdown / プレーンテキストをユーザーが手動で各サービスにコピペする必要があり、「個人開発者の手間を減らす」 という Shipyard のコア価値と整合していない。本 ADR では「ドラフト生成」 から「実配信」 までを Shipyard 内で完結させる方針を確定する。

### 解決すべき設計課題

1. **3 チャネルの関係性**: 別個 3 機能として実装するか / キャンペーン(1 告知 → 多チャネル展開)として統合するか
2. **データモデル**: チャネル別テーブルに分けるか / Delivery 1 テーブル(Json ペイロード)に集約するか
3. **配信先の方針**:
    - ブログ:自前(Shipyard ドメイン下)/ 外部サービス連携(WordPress / はてな / Ghost)
    - メール:LP 購読フォーム + Subscriber テーブル(ニュースレター型)/ 内部メンバー手動指定(シンプル)
    - Twitter:Web Intent(OAuth 不要)/ X API + OAuth 2.0 PKCE(自動送信)
4. **MVP スコープと公開時期**: 公開目標 Day 55 とのバランス、3 機能の Phase 分け
5. **AI prompt の多チャネル最適化**: 既存の DRAFT_GEN(各チャネル個別)を活かすか、新規 `ANNOUNCEMENT_GEN` で 3 チャネル文面を一括生成するか
6. **セキュリティ**: Twitter access token の暗号化保管、Blog の XSS 対策、Subscriber の購読証跡(特送法対応)

### 既存実装との関係

- `Feature.TWEET` / `RELEASE_BLOG` / `EMAIL` enum 値は `packages/db/prisma/schema.prisma` に既に定義済(Day 29 で `GENERATABLE_DOC_TYPES` 拡張時に対応)
- `MailService.sendInvitation`(Day 17、ADR-007)で Resend SDK + React Email 基盤は稼働中(現状は招待メール送信のみ)
- `LandingPage`(ADR-009)で確立した「ブロック型コンテンツ + 公開 URL `/p/{slug}/{projectId}`」 のパターンを自前ブログの公開 URL 設計に流用可能
- `RagQaMessage.references`(ADR-005 Day 27 改訂)の「参照先が後で変わっても履歴的事実を保つために Json スナップショット保存」 パターンを `Delivery.content` に適用

関連:ADR-005(AI 戦略、`Feature` enum 追加が必要)、ADR-007(メール基盤、Subscriber 型一斉送信は v1.x で拡張)、ADR-009(LP ブロック型、ブログ公開 URL 設計を流用)、ADR-012(プラン構造、AI クレジット消費対象に `ANNOUNCEMENT_GEN` を加える)、§9.11(本機能の起票)

## 検討した選択肢

ブレストフェーズで以下の 6 軸を確認し、案を確定した。各軸の検討詳細はブレストログ(本 ADR の理由節 + §9.11)に集約する。

### 1. 中核課題

| 案                                   | 採否     | 備考                                                                  |
| ------------------------------------ | -------- | --------------------------------------------------------------------- |
| リリース時の告知ワンクリック化       | ✅ 採用  | must 要件として MVP 主軸に位置付け                                    |
| リリース後の継続コンテンツ運用       | ✅ want  | データモデルで構造的にカバー(複数 Announcement)、機能の厚みは v1.x で |
| 初期ユーザー獲得 = リスト形成 + Nurture | △ 部分採用 | Subscriber リスト形成は v1.x でメール配信と同時に                     |

### 2. 配信モデル

| 案                       | 採否      | 備考                                                                       |
| ------------------------ | --------- | -------------------------------------------------------------------------- |
| キャンペーン型(1 → N)    | ✅ 採用   | 1 つの Announcement を 3 チャネルに展開。リリース告知 = ワンクリック と整合 |
| チャネル独立型(3 機能)  | ❌ 不採用 | UI / DB の DRY 性が低く、キャンペーンとしての一貫性が見えにくい            |
| ハイブリッド             | ❌ 不採用 | 初期設計コストが上がり MVP スコープが膨らむ                                |

### 3. ブログ配信先

| 案                                    | 採否      | 備考                                                                                                                                |
| ------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 自前ブログ(Shipyard ドメイン下)        | ✅ 採用   | LP の公開 URL(`/p/{slug}/{projectId}`)パターン + ブロック型レンダリング(ADR-009)を流用、実装最軽量                                  |
| 外部サービス連携(WordPress / はてな等) | ❌ 不採用 | Zenn / Note は公式 API がなく対象外。OAuth + 認証情報保管の複雑さ +1 Day。MVP 後の v2 で再評価                                       |
| 両方(自前を MVP / 外部を v2)         | △ 余地のみ | `BlogPost.publishTarget` の拡張余地は持つが、MVP では INTERNAL のみ実装                                                              |

### 4. メール宛先

| 案                                                  | 採否      | 備考                                                                                                                              |
| --------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| LP 購読フォーム + Subscriber テーブル(ニュースレター型) | ✅ 採用(v1.x) | 継続コンテンツ運用 = want 要件まで構造的にカバー。リリース時点で購読者 0 の状態で出しても価値が薄い → 一定数貯まってから v1.x で公開 |
| チームメンバー + 手動追加リスト(シンプル)            | ❌ 不採用 | 「初期ユーザー獲得」 という機能本来の価値が出ない                                                                                  |
| 両方(MANUAL を MVP / Subscriber を v2)             | ❌ 不採用 | スコープを最小化したい時に検討候補だが、ユーザー判断で「メールは丸ごと v1.x」 が確定                                              |

### 5. Twitter スコープ

| 案                                       | 採否      | 備考                                                                                                          |
| ---------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| X API + OAuth 2.0 PKCE(自動送信)         | ✅ 採用   | 「告知ワンクリック」 体験の主役。送信ステータス検知 + 予約投稿 + スレッド対応の基盤になる                       |
| Web Intent(OAuth 不要、X 画面を開くだけ) | ❌ 不採用 | API キー不要で軽量だが、Shipyard 側で送信完了を検知できず「送信済み」 チェックボックスで代替する形になる         |
| MVP は Intent、v2 で OAuth               | ❌ 不採用 | ユーザー判断で「Twitter は本格実装で MVP に含める」 が確定                                                    |

### 6. リリースタイミング

| 案                                            | 採否        | 備考                                                                                                                       |
| --------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| Twitter + ブログを MVP / メールを v1.x      | ✅ 採用     | Twitter は告知の主役で MVP 必須。ブログは LP 流用で軽量。メールは Subscriber 0 でリリースしても価値が出ないため v1.x へ送り |
| 全機能を MVP 同梱(Day 55 → Day 60-62)        | ❌ 不採用   | Subscriber リストが空の状態で公開しても価値が出ない                                                                        |
| 全機能を v1.x 送り                            | ❌ 不採用   | 「初期ユーザー獲得」 工程の支援機能は公開時点で価値訴求できる                                                              |
| Phase 分け(Blog+Mail v1.x / Twitter v1.y) | ❌ 不採用   | Twitter を後に回すと「リリース告知ワンクリック」 が成立しない                                                              |

## 決定

### MVP スコープ(Day 56-59、+4 Day シフトで公開目標 Day 55 → Day 59)

1. **Announcement entity**(Project 直下、複数件)+ **Delivery entity**(チャネル別配信、1 Announcement × 1 channel)を新設
2. **Twitter 配信**:OAuth 2.0 PKCE による個人アカウント連携、Shipyard が `POST /2/tweets` を代行
3. **自前ブログ**:`BlogPost` テーブル + 公開 URL `/p/{slug}/{projectId}/blog/{postSlug}`(LP の `/p/{slug}/{projectId}` パターン流用)+ ブロック型レンダリング
4. **AI 多チャネル文面生成**:新規 `Feature.ANNOUNCEMENT_GEN`(Sonnet 4 + Tool Use)で 1 Announcement から Twitter(280 字)/ Blog 本文(Markdown)を一括生成

### v1.x(公開後 2〜4 週間、Day 60+)

1. **メール配信**:LP に購読フォームブロック追加 → `Subscriber` テーブル + Double opt-in + unsubscribe link + Resend 一斉送信
2. **Delivery.channel** に `EMAIL` を追加し、既存 Announcement に Email Delivery がぶら下がる形で拡張(entity の作り直し不要)

### v2 候補

- 外部ブログ連携(WordPress REST / はてな AtomPub / Ghost)
- Twitter スレッド投稿 / 予約投稿
- 効果計測ダッシュボード(Twitter Insights API / blog アクセス解析)
- Workspace 横断の Campaign Hub

### データモデル(MVP 確定範囲)

```prisma
/// 1 つの告知トピック(ADR-014)。
/// Project 配下に複数件持てる(リリース告知 v1.0 / アップデート告知 v1.1 / 機能追加告知 ...)。
/// Delivery が 1 件もない Announcement は DRAFT のまま存在可能(ドラフト保管)。
model Announcement {
  id            String   @id @default(cuid())
  tenantId      String
  projectId     String
  title         String                  // 内部管理用タイトル(配信文面とは別)
  status        AnnouncementStatus      // DRAFT | READY | EXECUTING | DONE
  createdById   String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deliveries    Delivery[]

  tenant    Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdBy User    @relation(fields: [createdById], references: [id])

  @@index([tenantId, projectId])
}

/// チャネル別配信(ADR-014)。1 Announcement × 1 channel = 1 Delivery(@@unique)。
/// content は Json でチャネル別ペイロードを保持(v1.x で EMAIL 追加時にスキーマ変更不要)。
model Delivery {
  id              String   @id @default(cuid())
  tenantId        String
  announcementId  String
  channel         DeliveryChannel        // TWITTER | BLOG (v1.x: EMAIL)
  status          DeliveryStatus         // DRAFT | SCHEDULED | SENT | FAILED
  content         Json
  scheduledAt     DateTime?              // null = 即時実行
  sentAt          DateTime?
  externalRef     String?                // TWITTER: tweet id / BLOG: BlogPost.id
  error           String?                // 失敗時のメッセージ

  tenant       Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  announcement Announcement @relation(fields: [announcementId], references: [id], onDelete: Cascade)

  @@unique([announcementId, channel])
  @@index([tenantId, status])
}

/// 自前ブログの記事(ADR-014)。
/// LP と同じ「アプリ内編集 + 公開 URL」 パターン(ADR-009)を踏襲。
/// Delivery 経由で publish された記事は deliveryId で紐付く(将来の編集追跡用)。
model BlogPost {
  id            String   @id @default(cuid())
  tenantId      String
  projectId     String
  slug          String                  // URL 用 slug
  title         String
  body          String                  // Markdown 本文
  publishedAt   DateTime?               // null = 下書き
  deliveryId    String?  @unique        // Announcement 経由なら紐付く
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  project  Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  delivery Delivery? @relation(fields: [deliveryId], references: [id], onDelete: SetNull)

  @@unique([tenantId, projectId, slug])
  @@index([tenantId, projectId, publishedAt])
}

/// Twitter (X) アカウント連携情報(ADR-014)。
/// テナント単位で複数アカウント連携を許容(個人 / 会社など)。
/// accessToken / refreshToken はアプリ層で AES-GCM 暗号化してから保存(Secrets Manager で master key 管理)。
model TwitterAccount {
  id              String   @id @default(cuid())
  tenantId        String
  connectedById   String                // TenantMember.userId(連携実行者)
  xUserId         String                // X 側 user id
  handle          String                // @handle(表示用)
  accessToken     String                // 暗号化保管(下記セキュリティ節)
  refreshToken    String                // 暗号化保管
  expiresAt       DateTime
  scopes          String[]              // tweet.read tweet.write users.read
  createdAt       DateTime @default(now())

  tenant      Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  connectedBy User   @relation(fields: [connectedById], references: [id])

  @@unique([tenantId, xUserId])
  @@index([tenantId])
}

enum DeliveryChannel    { TWITTER BLOG /* EMAIL は v1.x */ }
enum DeliveryStatus     { DRAFT SCHEDULED SENT FAILED }
enum AnnouncementStatus { DRAFT READY EXECUTING DONE }
```

### Delivery.content の Json スキーマ

- `TWITTER`: `{ text: string, replyToTweetId?: string }`(280 文字制限を BE + FE で二重バリデーション)
- `BLOG`: `{ blogPostId: string, summary: string }`(BlogPost を別 entity に切り出し、Delivery は参照のみ)
- `EMAIL`(v1.x):`{ subject: string, html: string, recipientSource: 'SUBSCRIBERS' | 'MANUAL' }`

### `Feature` enum 追加

新規 `Feature.ANNOUNCEMENT_GEN` を追加(`ALTER TYPE ... ADD VALUE` 単独 migration)。Sonnet 4 + Tool Use で「1 Announcement の入力 → Twitter 文(280 字 N 件)+ Blog 本文(Markdown)」 を一括生成する用途。既存の `Feature.TWEET` / `RELEASE_BLOG` / `EMAIL` は **draft generation 専用として残置**し、本機能のキャンペーン文面生成は `ANNOUNCEMENT_GEN` で計上する(AIUsage の集計上、ドラフト機能と配信機能を区別)。

### プラン制限(ADR-012 と整合)

| プラン                          | 配信実行                                  | AI クレジット消費          |
| ------------------------------- | ----------------------------------------- | -------------------------- |
| トライアル(7 日)                | ✅ Pro 同等                                | Sonnet 4 多チャネル = 4 cr/回 |
| Pro(¥1,480)                    | ✅ 月次上限 50 回(MVP の暴走防止枠)       | 300 cr 月次プールから消費 |
| Team(¥2,800/人)                 | ✅ Pro 同様                               | seat × 800 cr 共有プール    |
| Free フォールバック             | ❌ 配信不可(AI 機能停止と整合、ADR-012)   | -                          |

`AIUsageService.assertWithinAnnouncementQuota({ tenantId, plan })` を新設(`assertWithinDiagnosisQuota` と同パターン)。Twitter 投稿そのものはユーザー個人の X Free Tier 枠(月 1500 投稿)を消費するため Shipyard 側のレート制限とは独立。

### セキュリティ

- **Twitter access token / refresh token**:アプリ層 AES-GCM で暗号化してから DB 保存(master key は AWS Secrets Manager、env `TWITTER_TOKEN_ENCRYPTION_KEY_ARN`)。Prisma レベルでは暗号化済バイト列を文字列として保持
- **X OAuth callback の state / PKCE verifier**:Redis(Upstash)に短期保存(5 分 TTL)、CSRF 対策
- **Blog 公開ページの XSS**:LP の `safeHref`(ADR-009)+ Markdown レンダリング時の DOMPurify、`/p/{slug}/{projectId}/blog/{postSlug}` も Clerk middleware の公開ルートに追加
- **Subscriber unsubscribe(v1.x)**:token = ランダム 32 バイト、URL に埋め込み、`Subscriber.unsubscribedAt` を SET(物理削除しない、再購読を防ぐホワイトリスト管理)
- **Subscriber メール送信(v1.x)**:特送法対応(送信者表示 / unsubscribe link / 配信目的の明示)を React Email テンプレートで強制

### API 設計(MVP 確定範囲、エンドポイント詳細はブレスト継続後に確定)

| カテゴリ                          | エンドポイント概要                                                                                                | 認可                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Announcement CRUD                 | `POST/GET/PATCH/DELETE /workspaces/:slug/projects/:projectId/announcements`                                       | WRITER_ROLES が作成 / 全員閲覧 |
| AI 文面生成                       | `POST .../announcements/:id/generate`(`Feature.ANNOUNCEMENT_GEN`、Sonnet 4 + Tool Use、Twitter + Blog を一括出力)  | WRITER_ROLES           |
| Delivery 実行                     | `POST .../announcements/:id/deliveries/:deliveryId/execute`(即時 or 予約)                                         | WRITER_ROLES           |
| Twitter OAuth                     | `GET /workspaces/:slug/integrations/twitter/connect` / `GET /webhooks/twitter/callback`(state + PKCE)              | OWNER / ADMIN          |
| BlogPost                          | `POST/GET/PATCH .../blog-posts`(+ 公開 URL `/p/{slug}/{projectId}/blog/{postSlug}` = 未認証可、Clerk middleware 除外) | WRITER_ROLES が編集 / 全員閲覧 |

### UI 配置

- プロジェクト詳細(`/w/{slug}/projects/{projectId}`)の Card グリッドに「告知配信」 Card を追加(`AI 壁打ち` / `ランディングページ` / `プロダクト診断` と並ぶ)
- `/w/{slug}/projects/{projectId}/announcements`:Announcement 一覧 + 「新規告知」 ボタン
- `/w/{slug}/projects/{projectId}/announcements/{id}`:文面編集(Twitter / Blog タブ)+ AI 生成 / プレビュー / 実行ボタン + Delivery ステータス
- ワークスペース設定 `/w/{slug}/settings/integrations`:Twitter 連携の接続 / 切断、現在の連携アカウント一覧

## 理由

### キャンペーン型(1 → N)を採る根拠

- リリース告知は本質的に「1 つの伝えたいこと」 を複数チャネルに展開する行為。チャネルごとに独立画面で書かせると、ユーザーは同じ内容を 3 回考える羽目になる
- AI 多チャネル最適化(`ANNOUNCEMENT_GEN`)が「1 Announcement → 3 ペイロード」 を 1 リクエストで返せる前提に乗せやすい
- Delivery を別 entity にすることで、チャネル別に独立して成功 / 失敗 / 再送できる(Twitter は通ったが Blog 公開は後回し、等)

### 自前ブログ(Shipyard ドメイン下)を採る根拠

- LP の「アプリ内編集 + 公開 URL」 パターン(ADR-009)を流用でき、実装が最小(BlogPost テーブル + ブロック型レンダリングの再利用)
- 外部連携は OAuth + 認証情報保管 + 各サービスの API 仕様吸収で +1 Day 以上、対応サービスも 1-3 に限定される(Zenn / Note は API なし)
- 個人開発者ユーザーが Shipyard 上で「プロダクトサイト + リリースブログ」 をまとめて管理できる体験は Framer / Carrd と同じ方向で価値が分かりやすい

### Twitter OAuth + API(Web Intent ではなく)を採る根拠

- 送信ステータスを Shipyard 側で検知できる(Web Intent では「送信済み」 チェックボックス手動チェックに頼ることになる)
- v1.x 以降の予約投稿・スレッド投稿・効果計測の基盤になる
- ユーザー個人の X アカウントを使うため、Shipyard 側で X API 料金は発生しない(各ユーザーの Free Tier 月 1500 投稿枠を消費)

### メールを v1.x へ送る根拠

- Subscriber リストが 0 の状態で公開しても、メール配信機能の価値は顕在化しない(購読者が貯まってからこそ「一斉配信」 の意味が出る)
- Subscriber + 購読フォーム + Double opt-in + unsubscribe + 特送法対応は実装規模が大きく、MVP に同梱すると公開目標 Day 55 → Day 62 程度まで後ろ倒しになる
- ユーザーが Day 55 公開を維持しつつ「メールは公開後」 という判断を明示

## 結果(Consequences)

### 良い影響

- 公開時の Hero / Features に「**リリース告知をワンクリックで Twitter + 自前ブログに一斉配信**」 を訴求できる(他の SaaS で「個人開発者向け統合告知ツール」 は空白領域)
- LP の「アプリ内編集 + 公開 URL」 パターンを 2 度目に応用(LP / ブログ)することで、Shipyard の「Project 中心の SaaS 体験」 が一段強化される
- v1.x でメール配信を加えると「リスト形成 → Nurture → 告知」 のフル機能になり、Substack / ConvertKit 寄りの価値も付加できる(差別化軸の追加)
- `ANNOUNCEMENT_GEN`(Sonnet 4 + Tool Use で 3 チャネル文面一括生成)は Pro プランの目玉機能として PRODUCT_DIAGNOSIS と並べられる
- Zenn 記事のサブテーマに「OAuth 2.0 PKCE + Twitter API v2 + 暗号化トークン保管」 を加えられる(技術ネタとして強い)

### 悪い影響・リスク

- **公開目標が Day 55 → Day 59 に +4 Day シフト**(Day 56-59 を新規割当、設計詳細はブレスト継続後に Day 単位の内訳確定)
- **X API のアカウントサスペンドリスク**:Shipyard 開発者アカウントの Developer App が規約違反判定を受けると全テナントの Twitter 連携が停止する → 対策:利用規約に「投稿内容はユーザー責任」 明記、運用上の監視(投稿失敗率)
- **Twitter token 暗号化の運用コスト**:Secrets Manager + AES-GCM の鍵ローテーション運用が必要(初期は手動、v1.x で自動化)
- **Blog の SEO がユーザーの独自ドメインに乗らない**:`shipyard.app/p/{slug}/{projectId}/blog/...` ドメインなので、Shipyard 全体の SEO に貢献するがユーザー個別の SEO 資産にはならない → 対策:Phase 4 カスタムドメイン(ADR-009 v2)で将来解消
- **Subscriber 0 で公開する選択(v1.x 送り)による初回告知の弱さ**:Shipyard 自身のリリース告知時は Twitter + Zenn を手動で実施することで補う(Day 52-53 既存予定)
- **AI 多チャネル文面生成のコスト**:Sonnet 4 多チャネル 1 回 = 約 4 cr 想定(MVP 暴走防止枠で月 50 回上限を設定)

### フォローアップ

#### ブレスト継続中(本セッション内で確定予定)

- 設計セクション 2/6 = AI 多チャネル最適化と DRAFT_GEN との関係
- 設計セクション 3/6 = API + FE 構造の詳細(エンドポイント仕様 / 画面構成)
- 設計セクション 4/6 = セキュリティ(Twitter OAuth フロー詳細、token 暗号化スキーム)
- 設計セクション 5/6 = v1.x メール拡張時の余地(Delivery.content / Subscriber テーブル)
- 設計セクション 6/6 = エラーハンドリング・テスト戦略・工数内訳
- 確定後:`docs/superpowers/specs/2026-05-28-multi-channel-publishing-design.md`(Spec doc)を作成し、本 ADR からリンク

#### Day 56-59 で実施(MVP 実装、本 ADR の主要部、設計確定後に Day 単位の内訳を §6 で確定)

- `Announcement` / `Delivery` / `BlogPost` / `TwitterAccount` model + migration
- `Feature.ANNOUNCEMENT_GEN` enum 追加 migration(`ALTER TYPE ... ADD VALUE` 単独 migration)
- `apps/api/src/announcements/`(service + controller + DTO + Tool Use schema)
- `apps/api/src/integrations/twitter/`(OAuth callback handler、token 暗号化 service、API client)
- `apps/api/src/blog/`(BlogPost CRUD + 公開 API)
- `apps/web/src/app/p/[slug]/[projectId]/blog/[postSlug]/page.tsx`(公開ブログページ、Clerk middleware 除外)
- `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/`(Announcement 一覧 + 編集 + 実行 UI)
- `apps/web/src/app/w/[slug]/settings/integrations/`(Twitter 連携設定)
- E2E:Twitter OAuth フロー / Blog 公開 / Announcement 作成→AI 生成→Delivery 実行 / 失敗時のリトライ

#### v1.x(公開後 2〜4 週間)で実施

- `Subscriber` model + LP 購読フォームブロック + Double opt-in + unsubscribe API
- `DeliveryChannel.EMAIL` 追加 + 一斉送信(Resend bulk send / Audience)
- 特送法対応の React Email テンプレート(送信者 / 目的 / unsubscribe)

#### v2 候補

- 外部ブログ連携(WordPress REST / はてな AtomPub / Ghost)
- Twitter スレッド投稿 / 予約投稿のスケジューラ
- 効果計測(Twitter Insights API / blog アクセスログ / メール開封率)
- Workspace 横断の Campaign Hub
- カスタムドメイン(ADR-009 Phase 4)が入ればユーザー独自ドメインで blog 公開可能に

#### 監視すべき指標

- Announcement 作成数 / プロジェクト数(機能の利用率)
- 各 Delivery の成功率(channel 別)
- Twitter token の refresh 成功率 / expiresAt 経過後の再連携率
- `ANNOUNCEMENT_GEN` の 1 回あたり平均 AI コスト
- v1.x 公開後の Subscriber 増加率と告知開封率

#### 将来の見直しトリガー

- X API の料金プラン変更で個人ユーザーの Free Tier が縮小された場合 → Web Intent への部分回帰
- 自前ブログのアクセスが期待を下回る場合 → 外部連携(WordPress / はてな)の v2 前倒し
- Subscriber メール配信の特送法対応で不備指摘があった場合 → 法務レビューを v1.x 前に追加
