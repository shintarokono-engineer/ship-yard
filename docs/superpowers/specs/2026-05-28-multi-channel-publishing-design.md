# Spec: マルチチャネル告知配信(Twitter + 自前ブログ + メール)

**作成日**: 2026-05-28
**ステータス**: 設計確定(セクション 1〜6 完了、実装計画は writing-plans で別途)
**関連**: ADR-014(本機能のアーキテクチャ ADR) / PROJECT_STATUS §9.11(プロジェクトコンテキスト) / ADR-005(AI 戦略) / ADR-007(メール基盤) / ADR-009(LP ブロック型) / ADR-012(プラン構造) / ADR-013(プロダクト診断、Tool Use パターン参照)

## 0. このドキュメントについて

ADR-014 で確定した「マルチチャネル告知配信」 機能の **実装に直結する詳細設計**。ADR-014 が「何を採る / なぜ採る」 を扱うのに対し、本 Spec doc は「どう作るか」 を扱う。

### スコープの境界

| Phase    | 範囲                                                                                          |
| -------- | --------------------------------------------------------------------------------------------- |
| **MVP**  | Twitter(OAuth + API)+ 自前ブログ(`/p/{slug}/{projectId}/blog/{postSlug}` で公開)         |
| v1.x.1   | メール配信(`Subscriber` + LP 購読フォーム + Double opt-in + unsubscribe + 特送法対応)        |
| v1.x.2   | 配信ログ詳細(Resend Webhook で開封率 / クリック率 / バウンス収集)+ テスト送信 + プレビュー  |
| v2       | 外部ブログ連携 / Twitter スレッド・予約投稿 / 効果計測ダッシュボード / Campaign Hub          |

### 公開目標への影響

公開目標 Day 55 → **Day 59 に +4 Day シフト**(Day 56-57 = BE / Day 58-59 = FE + 公開)。

---

## 1. 全体像 + データモデル

### コンセプト

> Project 配下に **Announcement(告知)** を作り、その下に **Delivery(チャネル別配信)** をぶら下げる。

- 1 Announcement = 1 つの告知トピック(例:v1.0 リリース / v1.1 機能追加 / 進捗共有)
- 1 Delivery = 1 つのチャネル投稿(Twitter 1 件 / Blog 1 記事 / 将来:Email 1 配信)
- 各 Delivery は **独立にスケジュール・実行・失敗** する(Twitter 投稿は成功したが Blog は下書きのまま、等を許容)

### Prisma schema(MVP 確定範囲)

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
/// executedById は execute 時に SET(監査ログ目的)。
model Delivery {
  id              String   @id @default(cuid())
  tenantId        String
  announcementId  String
  channel         DeliveryChannel        // TWITTER | BLOG (v1.x: EMAIL)
  status          DeliveryStatus         // DRAFT | SCHEDULED | SENT | FAILED
  content         Json
  scheduledAt     DateTime?              // null = 即時実行
  sentAt          DateTime?
  executedById    String?                // execute 時に SET、監査ログ
  externalRef     String?                // TWITTER: tweet id / BLOG: BlogPost.id
  error           String?                // 失敗時のユーザー向け日本語メッセージ

  tenant       Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  announcement Announcement @relation(fields: [announcementId], references: [id], onDelete: Cascade)
  executedBy   User?        @relation(fields: [executedById], references: [id])

  @@unique([announcementId, channel])
  @@index([tenantId, status])
}

/// 自前ブログの記事(ADR-014)。
/// LP と同じ「アプリ内編集 + 公開 URL」 パターン(ADR-009)を踏襲。
/// Delivery 経由で publish された記事は deliveryId で紐付く(将来の編集追跡用)。
/// Delivery 削除時は SetNull で残置 = 公開 URL は維持される。
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
/// accessToken / refreshToken はアプリ層 AES-256-GCM で暗号化してから保存。
/// master key は AWS Secrets Manager(env TWITTER_TOKEN_ENCRYPTION_KEY)。
model TwitterAccount {
  id              String   @id @default(cuid())
  tenantId        String
  connectedById   String                // TenantMember.userId(連携実行者、監査用)
  xUserId         String                // X 側 user id
  handle          String                // @handle(表示用)
  accessToken     String                // base64url(iv || tag || ciphertext)
  refreshToken    String                // base64url(iv || tag || ciphertext)
  expiresAt       DateTime
  scopes          String[]              // tweet.read tweet.write users.read offline.access
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

- `TWITTER`: `{ text: string }`(280 文字制限を BE + FE で二重バリデーション)
- `BLOG`: `{ blogPostId: string, summary: string }`(BlogPost を別 entity に切り出し、Delivery は参照のみ)
- `EMAIL`(v1.x):`{ subject: string, htmlBody: string, plainTextBody: string, recipientSource: 'SUBSCRIBERS' | 'MANUAL' }`

### `Feature` enum 追加

新規 `Feature.ANNOUNCEMENT_GEN` を追加(`ALTER TYPE ... ADD VALUE` 単独 migration、Day 14/27/43/49 と同パターン)。Sonnet 4 + Tool Use で「1 Announcement の入力 → Twitter 文 + Blog 本文」 を一括生成する用途。既存 `Feature.TWEET` / `RELEASE_BLOG` / `EMAIL` は draft generation 専用として残置。

### 既存スキーマとの関係

- `Project` に `announcements Announcement[]`、`blogPosts BlogPost[]` の back-relation を追加
- `Tenant` に `announcements Announcement[]`、`blogPosts BlogPost[]`、`twitterAccounts TwitterAccount[]` を追加
- `User` に `announcementsCreated Announcement[]`、`deliveriesExecuted Delivery[]`、`twitterAccountsConnected TwitterAccount[]` を追加
- `LandingPage` は触らない(Announcement の "コンテンツソース" として参照される側)

---

## 2. AI 多チャネル文面最適化(`ANNOUNCEMENT_GEN`)

### 既存 DRAFT_GEN との使い分け

| 機能                      | 用途                                                       | 保存先                     | 呼び出し点                                        |
| ------------------------- | ---------------------------------------------------------- | -------------------------- | ------------------------------------------------- |
| 既存 DRAFT_GEN(5 種)     | README / RELEASE_BLOG / TWEET / PRODUCT_HUNT / EMAIL の単発ドラフト生成 | `ProjectDocument`(append-only)| `POST .../documents/generate { kind }`            |
| 新規 ANNOUNCEMENT_GEN     | **キャンペーン単位で多チャネル文面を一括生成**             | `Delivery.content`(Json)   | `POST .../announcements/:id/generate`             |

- **役割分担**:DRAFT_GEN は「コンテンツ資産を作る」、ANNOUNCEMENT_GEN は「配信用の文面を仕上げる」
- **流用**:Announcement 編集時に「既存の TWEET ドラフトを下敷きにする」 オプションは v1.x(MVP は ANNOUNCEMENT_GEN 一択)
- **AIUsage 集計**:Feature 別に分けることで「告知に使ったクレジット」 と「ドラフト作成に使ったクレジット」 を分離して可視化

### Tool スキーマ(`submit_announcement_drafts`)

```typescript
// apps/api/src/announcements/announcement-types.ts
export type AnnouncementDrafts = {
  twitter: {
    text: string; // 280 字以内、絵文字込み、hashtag は AI 判断
  };
  blog: {
    title: string;       // 60 字以内(SEO 推奨)
    body: string;        // Markdown 本文(500〜2000 字目安)
    summary: string;     // OG description 用、120 字以内
  };
  // v1.x:email: { subject: string, htmlBody: string, plainTextBody: string }
};
```

Tool Use の `input_schema` に JSON Schema として記述、`tool_choice: { type: 'tool', name: 'submit_announcement_drafts' }` で強制呼び出し(既存 LP 生成 / 診断と同パターン)。

### prompt 構成

- **system prompt**:
  - `AI_PERSONA_INTRO`(既存共通)
  - チャネル別ガイドライン:
    - Twitter:「280 字以内 / プロダクト名 + 1 行訴求 + LP URL / hashtag は 1-2 個 / 絵文字 1-2 個」
    - Blog:「Markdown 見出し構造 (h2 / h3) / リード文 → 機能/解決課題 → CTA / 画像はプレースホルダ `![alt](TODO)` / 内部リンクは LP URL のみ」
  - トーン統一:「Project の `categoryDomain`(ADR-013 改訂)に合わせる(ENTERTAINMENT なら親しみやすく、DEVELOPER_TOOL なら技術的に)」
- **user message**:
  - **必須**:Announcement.title + Project.name + Project.description + Project の構造化 2 軸(`categoryDomain` + `pricingTier`)+ 自由補足 4 textarea
  - **オプション**:最新 LP の `hero` block 抜粋(訴求文の一貫性)+ 最新 README の冒頭 300 字(機能リスト引用)
  - **MVP 範囲外**:過去 Announcement の RAG 検索 → v1.x

### モデル設定

| 要素             | 値                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------- |
| モデル           | `AI_MODEL_SONNET`(既存 DRAFT_GEN と同モデル)                                       |
| max_tokens       | 3072(Twitter 100 tok + Blog 2500 tok + 余裕)                                       |
| temperature      | 0.7(訴求文のバリエーション重視、DRAFT_GEN と同等水準)                              |
| Tool Use         | `submit_announcement_drafts` を強制                                                 |
| 1 回の想定コスト | 約 4-6 円(input ~2000 tok + output ~2500 tok、Sonnet 4 単価で計算)               |
| AI クレジット     | 4 cr(v1.0.1〜、ADR-012 のクレジット制で `ANNOUNCEMENT_GEN` の重みを 4 と設定)  |

### 再生成 vs 編集

- **生成後の Delivery.content は編集可能**(Twitter 280 字超過は BE バリデーション + FE リアルタイム文字数表示で reject)
- **再生成ボタン**:同じ Announcement.id に対して再呼び出し → 既存 Delivery.content を上書き(履歴は持たない、ADR-013 と同思想で「最新が真実」)
- **チャネル選択再生成**:`POST .../announcements/:id/generate?channels=TWITTER` で部分再生成可(クレジット消費はフル消費 = LLM コール 1 回固定)

### Twitter スレッド対応

- **MVP では単発 tweet のみ**(`twitter.text: string`)
- v1.x で `threadTexts: string[]` を追加 + Tool スキーマ更新 + 投稿時 `reply_to` チェーン

---

## 3. API + FE 構造

### API エンドポイント設計(MVP 確定)

#### Announcement CRUD + 生成 + 実行

| Method | パス                                                                                       | 用途                                                                                                                            | 認可                              |
| ------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| POST   | `/workspaces/:slug/projects/:projectId/announcements`                                      | 空の Announcement 作成(title のみ、status=DRAFT、Delivery 0 件)                                                              | WRITER_ROLES                      |
| GET    | `/workspaces/:slug/projects/:projectId/announcements`                                      | 一覧(createdAt 降順、軽量レスポンス `{ id, title, status, deliveryStatuses: { TWITTER, BLOG } }`)                            | 全テナントメンバー                |
| GET    | `/workspaces/:slug/projects/:projectId/announcements/:id`                                  | 詳細(Delivery 全件 + content 全文)                                                                                            | 全テナントメンバー                |
| PATCH  | `/workspaces/:slug/projects/:projectId/announcements/:id`                                  | title 編集 + Delivery.content 編集(Twitter 280 字 / Blog Markdown は BE バリデーション)                                       | WRITER_ROLES                      |
| DELETE | `/workspaces/:slug/projects/:projectId/announcements/:id`                                  | 物理削除(Delivery 連鎖削除、BlogPost は `deliveryId` SET NULL で残置 = 公開 URL は維持)                                       | WRITER_ROLES                      |
| POST   | `/workspaces/:slug/projects/:projectId/announcements/:id/generate`                         | **`ANNOUNCEMENT_GEN`** 実行(Sonnet 4 + Tool Use)。Body: `{ topic: string, channels?: ['TWITTER', 'BLOG'] }`(部分再生成可) | WRITER_ROLES + クレジット枠       |
| POST   | `/workspaces/:slug/projects/:projectId/announcements/:id/deliveries/:deliveryId/execute`   | Delivery 実行(MVP は同期即時)。Twitter = POST /2/tweets / Blog = BlogPost.publishedAt セット                                  | WRITER_ROLES                      |

#### Twitter 連携

| Method | パス                                                            | 用途                                                                                                  | 認可             |
| ------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------- |
| GET    | `/workspaces/:slug/integrations/twitter/authorize`              | OAuth 開始。PKCE verifier 生成 → Upstash Redis 保存(5 分 TTL)→ X 認可ページへ 302               | OWNER / ADMIN    |
| GET    | `/webhooks/twitter/callback`                                    | OAuth callback。state + code → token 交換 → AES-GCM 暗号化 → `TwitterAccount` upsert → 設定画面へ 302 | 認証不要(state 検証で代替) |
| GET    | `/workspaces/:slug/integrations/twitter`                        | 連携アカウント一覧(handle / connectedBy / expiresAt のみ、token は返さない)                        | 全テナントメンバー |
| DELETE | `/workspaces/:slug/integrations/twitter/:accountId`             | 切断(`TwitterAccount` 物理削除 + 任意で X 側 revoke API 呼び出し)                                  | OWNER / ADMIN    |

#### BlogPost

| Method | パス                                                                          | 用途                                                                                                    | 認可                  |
| ------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------- |
| GET    | `/workspaces/:slug/projects/:projectId/blog-posts`                            | 一覧(管理画面用、publishedAt 降順)                                                                    | 全テナントメンバー    |
| GET    | `/workspaces/:slug/projects/:projectId/blog-posts/:id`                        | 詳細(編集画面用)                                                                                      | 全テナントメンバー    |
| PATCH  | `/workspaces/:slug/projects/:projectId/blog-posts/:id`                        | 編集(title / slug / body / publishedAt のトグル)                                                      | WRITER_ROLES          |
| GET    | `/public/blog-posts/:slug/:projectId/:postSlug`                               | 未認証公開 API(BlogPost + Project.name + LP テーマ色を返す、`publishedAt` セット済みのみ、404 ガード) | 認証不要              |

> 注:BlogPost の POST は **Announcement.generate 経由でのみ作成**(手動 BlogPost 作成は v1.x)。MVP では「Announcement 中心の動線」 が一本化され、UI の入り口が分散しない。

### FE 画面構成

#### `/w/:slug/projects/:projectId/announcements`(Announcement 一覧、Server Component)

- Card グリッド(2 列)で Announcement を一覧表示
- 各 Card:title + createdAt + Delivery ステータスバッジ(Twitter: SENT/FAILED/DRAFT、Blog: PUBLISHED/DRAFT)
- 右上に「新規告知」 ボタン → `NewAnnouncementDialog`(title 入力 → POST → 編集ページへ redirect)
- 空状態:「最初の告知を作って、Twitter とブログに同時配信しましょう」 + CTA ボタン

#### `/w/:slug/projects/:projectId/announcements/:id`(編集 + 実行、Server Component + Client Components)

縦 3 ペイン:

1. **トップヘッダ**:title 編集(inline edit)+ 「AI で生成」 ボタン + クレジット消費表示「4 cr 消費(残り 280 cr)」
2. **チャネル別タブ**:`Twitter` / `Blog` のタブで切り替え
   - Twitter タブ:textarea(`text`、280 字カウンタ + 残り文字数)+ プレビュー(X 風 mock UI)+ 「ツイート実行」 ボタン
   - Blog タブ:title input + Markdown editor(`MarkdownViewer` の編集版、TASK_SPLIT / REFINE_DOC と同コンポーネント流用)+ プレビュー + slug input(自動生成 + 編集可)+ 「ブログを公開」 ボタン
3. **Delivery ステータスパネル**(下部):各 Delivery の status + sentAt + externalRef(Twitter: ツイート URL、Blog: 公開 URL) + 失敗時の error メッセージ + 再実行ボタン

主要 Client Component(`_components/` 配下):

- `AnnouncementGenerateDialog`:AI 生成ダイアログ(topic 入力 + channels 選択 + `useActionState` + `classifyAiApiError`)
- `TwitterContentEditor`:textarea + 文字数カウンタ + プレビュー
- `BlogContentEditor`:title + Markdown editor + slug + プレビュー
- `DeliveryExecuteButton`:`useOptimistic` で「実行中」 → 結果反映、失敗時は error トースト + 再実行可

Server Action(`_actions/announcements.ts`):

- `generateAnnouncementAction`(POST /generate を叩く + `revalidatePath`)
- `updateDeliveryContentAction`(PATCH を叩く)
- `executeDeliveryAction`(POST /execute + `revalidatePath`)

共通(`_shared/announcement-form.ts`):

- バリデーション定数(`TWITTER_TEXT_MAX=280`、`BLOG_TITLE_MAX=120`、`BLOG_BODY_MIN=100` 等)を `apps/api` 側 DTO と同期

#### `/w/:slug/settings/integrations`(設定タブの新規追加、Server Component)

- 既存の `/settings/{members,profile,billing,usage}` レイアウトに `integrations` タブを追加
- Twitter セクション:
  - 連携済アカウント一覧(handle + 連携者 + 有効期限) + 「切断」 ボタン
  - 未連携時:「X アカウントを連携する」 ボタン → `GET /workspaces/:slug/integrations/twitter/authorize` へ a タグ遷移(Server Action 不可、OAuth は GET ルート必須)
- v1.x で Email 連携 / Webhook 連携 等が追加された時もここに集約

#### `/p/:slug/:projectId/blog/:postSlug`(公開ブログページ、Server Component、Clerk middleware 除外)

- LP の公開ページ(`/p/:slug/:projectId`)と同じ装い:
  - ヘッダ:Project.name + ロゴ + 「LP に戻る」 リンク
  - 本文:title + publishedAt + Markdown レンダリング(`MarkdownViewer` 共通)
  - フッタ:Powered by Shipyard(LP と統一)
- `generateMetadata` で OG / Twitter Card(LP と同パターン)+ `canonical` URL(SEO)
- 404:`publishedAt` 未セット or 不在の postSlug → `notFound()`

#### Project 詳細(`/w/:slug/projects/:projectId`)の Card グリッドに「告知配信」 追加

- 既存の `ランディングページ` / `AI 壁打ち` / `プロダクト診断 or アイデア検証` と並ぶ Card を追加
- Card:Megaphone アイコン + 「告知配信」 + 「Twitter とブログに一斉配信」 + Announcement 件数表示

### Delivery 実行の同期/非同期判断

**MVP は同期(即時実行のみ)**:

- `POST /execute` → Service 内で Twitter API or BlogPost UPDATE を直接実行 → status を更新して返す
- 利点:実装最小、BullMQ / ジョブワーカー不要
- 欠点:Twitter API レスポンス待ち(~2-5 秒)+ Blog UPDATE で UI が待つ。UX は `useOptimistic` で吸収

**v1.x で予約投稿対応**:

- `Delivery.scheduledAt` をセット → `SCHEDULED` 状態 → BullMQ(Upstash)で時刻到達時に execute → 結果を Delivery に反映

### 既存パターンの再利用

| 既存パターン                                                                              | 流用箇所                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `_shared/<form>.ts` + `_actions/<feature>.ts` + `_components/<feature>-dialog.tsx` 3 層構成(Day 23) | `announcements/_shared/announcement-form.ts` 等                                            |
| `classifyAiApiError`(Day 23)                                                              | `AnnouncementGenerateDialog` のエラー分岐                                                    |
| `useOptimistic` + Server Action + `revalidatePath`(Day 28)                                | `DeliveryExecuteButton` の「実行中」 表示                                                    |
| `MarkdownViewer`(Day 28、`apps/web/src/components/`)                                       | Blog プレビュー + 公開ページ本文                                                             |
| `safeHref`(ADR-009)                                                                       | Blog 本文中の Markdown リンク + Tweet 本文中の URL                                          |
| `assertWithinDiagnosisQuota` パターン(ADR-013)                                            | `assertWithinAnnouncementQuota({ tenantId, plan })`(Free フォールバック 403 / 月次上限) |
| `ALTER TYPE Feature ADD VALUE` 単独 migration(Day 14 / 27 / 43 / 49)                      | `Feature.ANNOUNCEMENT_GEN` 追加                                                              |

---

## 4. セキュリティ詳細

### Twitter OAuth 2.0 PKCE フロー

```
User              Shipyard FE         Shipyard BE         Upstash Redis      X (twitter.com)
 │                    │                    │                    │                    │
 │ 「X 連携」 click   │                    │                    │                    │
 ├───────────────────▶│ GET /integrations/twitter/authorize     │                    │
 │                    ├───────────────────▶│                    │                    │
 │                    │                    │ generate state(32B random)             │
 │                    │                    │ generate code_verifier(64B base64url)  │
 │                    │                    │ code_challenge = SHA256(code_verifier) │
 │                    │                    │ SETEX twitter_oauth:{state} {verifier, tenantId, userId} TTL 300s
 │                    │                    ├───────────────────▶│                    │
 │                    │                    │ 302 → twitter.com/i/oauth2/authorize?  │
 │                    │                    │   client_id=...&scope=tweet.read+tweet.write+users.read+offline.access
 │                    │                    │   &state={state}&code_challenge={challenge}&code_challenge_method=S256
 │                    │◀───────────────────┤                    │                    │
 │ X 認可画面で承認   │                    │                    │                    │
 ├──────────────────────────────────────────────────────────────────────────────────▶│
 │                    │                    │                    │                    │
 │ 302 → /webhooks/twitter/callback?code=...&state=...                              │
 │◀──────────────────────────────────────────────────────────────────────────────────┤
 │                    │                    │                    │                    │
 │ GET /webhooks/twitter/callback?code=...&state=...                                 │
 ├────────────────────────────────────────▶│                    │                    │
 │                    │                    │ GET twitter_oauth:{state}              │
 │                    │                    ├───────────────────▶│                    │
 │                    │                    │◀───────────────────┤                    │
 │                    │                    │ {verifier, tenantId, userId} 取得      │
 │                    │                    │ DEL twitter_oauth:{state}              │
 │                    │                    │ POST https://api.twitter.com/2/oauth2/token │
 │                    │                    │   grant_type=authorization_code&code=&code_verifier={verifier}
 │                    │                    ├──────────────────────────────────────▶│
 │                    │                    │◀──────────────────────────────────────┤
 │                    │                    │ { access_token, refresh_token, expires_in, scope }
 │                    │                    │ encrypted_token = AES-256-GCM(access_token, masterKey)
 │                    │                    │ TwitterAccount upsert(tenantId, xUserId, ...)
 │                    │                    │ 302 → /w/{slug}/settings/integrations?connected=twitter
 │◀────────────────────────────────────────┤                    │                    │
```

#### 詳細ガード

- **state の検証**:Redis 不在 = リプレイ攻撃 or 期限切れ → 400「リンクが無効です」 + ログ警告
- **state の使い捨て**:取得直後に DEL(re-play 防止、TTL 5 分内であっても 2 回使えない)
- **PKCE code_verifier の保管場所**:Upstash Redis のみ(Cookie や DB に置かない、ステートレス)
- **callback URL の固定**:`APP_BASE_URL` + `/webhooks/twitter/callback` を環境別に env で持つ(local / staging / prod)。X Developer App の Callback URLs に同 3 つを登録
- **scope 検証**:返却された `scope` に `tweet.write` と `offline.access` が含まれていなければエラー(`offline.access` 無しでは refresh_token が来ない)
- **xUserId 重複**:同じ X アカウントが既に別テナントで連携済の場合 → `@@unique([tenantId, xUserId])` で衝突 → 409 + 「既に別のワークスペースで連携されています」

### Token 暗号化スキーム(AES-256-GCM)

```typescript
// apps/api/src/common/crypto/token-encryption.service.ts

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;        // GCM 推奨 96bit
const TAG_LENGTH = 16;       // GCM 認証タグ 128bit

// 暗号化結果のフォーマット:base64url(iv || tag || ciphertext)
// 1 つの文字列カラムで保管できるよう連結。先頭 12B = IV、次 16B = tag、残り = ciphertext

export class TokenEncryptionService {
  private readonly masterKey: Buffer; // 32B = 256bit

  constructor(configService: ConfigService) {
    const keyBase64 = configService.getOrThrow<string>('TWITTER_TOKEN_ENCRYPTION_KEY');
    this.masterKey = Buffer.from(keyBase64, 'base64');
    if (this.masterKey.length !== 32) {
      throw new Error('TWITTER_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
  }

  decrypt(encrypted: string): string {
    const buf = Buffer.from(encrypted, 'base64url');
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
```

#### Master key 運用

| 環境           | master key 保管                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| local          | `apps/api/.env.local` に `TWITTER_TOKEN_ENCRYPTION_KEY=<base64>`(`openssl rand -base64 32` で生成、`.gitignore` 済)             |
| staging / prod | AWS Secrets Manager `shipyard/twitter/token-encryption-key`(`infra/prod/secrets.tf` に追加)→ App Runner の runtime_environment_secrets で env 注入 |

- **鍵ローテーション**:MVP では手動。v1.x で「新 key で再暗号化」 バッチを実装
- **AWS KMS 連携**:v2 候補(envelope encryption で master key 自体を KMS で守る)

#### Token refresh フロー

```typescript
async getValidAccessToken(account: TwitterAccount): Promise<string> {
  const accessToken = this.crypto.decrypt(account.accessToken);
  // 期限 5 分前 buffer
  if (account.expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return accessToken;
  }
  // refresh
  const refreshToken = this.crypto.decrypt(account.refreshToken);
  const newTokens = await this.twitterClient.refreshAccessToken(refreshToken);
  await this.prisma.twitterAccount.update({
    where: { id: account.id },
    data: {
      accessToken: this.crypto.encrypt(newTokens.access_token),
      refreshToken: this.crypto.encrypt(newTokens.refresh_token),
      expiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
    },
  });
  return newTokens.access_token;
}
```

#### Token revocation(切断時)

- `DELETE /integrations/twitter/:accountId` 時に X の `POST /2/oauth2/revoke` を best-effort で呼び出す(失敗してもローカル削除は実行)
- 既に発行された tweet は X 側に残る(削除はユーザーが X 上で行う仕様)

### Multi-tenant 分離

- `TwitterAccount.tenantId` 経由でテナント分離(既存 Prisma Client Extension の tenantId 自動注入で担保)
- **誰の token がどのテナントで使えるか**:`TwitterAccount` は tenant ごと。`connectedById`(連携実行者)は監査ログ用で、配信実行時の権限とは独立(WRITER_ROLES なら誰でもそのテナントの TwitterAccount で投稿可能)
- 同じ X アカウントを 2 テナントで連携する場合は別エントリ(`xUserId` は同じだが `tenantId` が異なる)→ `@@unique([tenantId, xUserId])` で許容

### 監査ログ

Delivery テーブル自体が監査ログを兼ねる:

- `Delivery.executedById`(execute 時に SET)+ `sentAt` + `externalRef`(tweet id)
- 誰がいつどの Tweet を投げたかは `Delivery` を見れば追跡可能
- v1.x で `AuditLog` モデルを Team プラン専用機能として導入する場合は、Delivery への `INSERT` をフックして AuditLog にも記録(ADR-002 既出)

### Blog 公開ページのセキュリティ

| 観点                 | 対策                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| XSS                  | Markdown レンダリング時に DOMPurify、`MarkdownViewer` 共通コンポーネントに集約。href は `safeHref`(ADR-009)で `javascript:` 等を除去 |
| CSP                  | Next.js middleware で `Content-Security-Policy: default-src 'self'; img-src 'self' https: data:; script-src 'self'`                |
| Clerk 認証バイパス   | `apps/web/src/middleware.ts` の `publicRoutes` に `/p/(.*)` を既に追加済(LP 公開ページと共通)→ Blog も自動的に通る              |
| SQL Injection        | Prisma 経由のみ                                                                                                                     |
| rate limit           | MVP は Vercel 標準の DDoS 防御で十分。Pro 移行で Vercel Pro の Bot Protection を有効化(v1.x で必要なら)                            |
| robots.txt / sitemap | `apps/web/src/app/robots.txt` + `apps/web/src/app/sitemap.ts` で `/p/*` を index 可、`/w/*` を Disallow                              |
| canonical URL        | `generateMetadata` で `alternates: { canonical: ${APP_BASE_URL}/p/${slug}/${projectId}/blog/${postSlug} }` を設定                  |

### Rate limit と AbuseManagement

- **Twitter API 側**:`POST /2/tweets` はユーザー個人の枠(月 1500 投稿、Free Tier)。Shipyard 側で消費する Tier はない(コスト 0)。429 を受けたら Delivery を FAILED + error メッセージに残す
- **Shipyard 側**:`assertWithinAnnouncementQuota`(MVP は月 50 回上限)で AI 多チャネル生成の暴走を防ぐ
- **Blog 公開ページ**:Vercel エッジで自然に分散される

### 環境変数追加(`apps/api/.env.example`)

```bash
# Twitter OAuth 2.0 PKCE
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...                              # Confidential Client 想定(Public でも可)
TWITTER_REDIRECT_URI=http://localhost:3000/webhooks/twitter/callback
TWITTER_TOKEN_ENCRYPTION_KEY=<base64 of 32 bytes>     # openssl rand -base64 32

# Upstash Redis(既存)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

---

## 5. v1.x メール拡張時の余地

### MVP で意図的に作らないもの(v1.x 送り)

| 項目                           | v1.x 送りの理由                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `Subscriber` テーブル           | リスト 0 件で公開しても価値が顕在化しない                                                  |
| LP の購読フォームブロック       | Subscriber と一蓮托生(購読フォームだけあって受け皿なしは UX 崩壊)                       |
| Double opt-in / unsubscribe   | 特送法対応とセットで一括実装(法務レビューも要るためまとめて)                            |
| Email Delivery 編集 UI         | Announcement 編集画面の Email タブ追加 = v1.x で UI 拡張                                 |
| 設定画面「購読者管理」 タブ      | Subscriber と一蓮托生                                                                    |
| 配信ログ / 開封率追跡           | Resend Webhook 連携が必要、v1.x.2 で追加                                                |

### MVP で素地として用意するもの

| 素地                                                  | 内容                                                                                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Delivery.channel` enum の構造**                    | `enum DeliveryChannel { TWITTER BLOG }`(MVP) → v1.x で `ALTER TYPE "DeliveryChannel" ADD VALUE 'EMAIL'` 単独 migration 1 本で足せる                                                  |
| **`Delivery.content` を Json で持つ**                  | TWITTER / BLOG の現状の Json カラムに、v1.x で EMAIL を足すだけ。schema 変更不要                                                                                                       |
| **`Feature.ANNOUNCEMENT_GEN` の 1 つの enum 値**       | Email 文面生成も同 Feature で計上(channel 別に enum を増やさない)                                                                                                                    |
| **`MailService` の機能特化メソッドパターン(ADR-007)** | 既存 `sendInvitation` のみ。v1.x で `sendAnnouncementToSubscribers` 等を **メソッド追加するだけ**                                                                                      |
| **LP ブロック型(ADR-009)**                            | v1.x で `subscribe_form` ブロックを追加するのは `LP_BLOCK_TYPES` に 1 種追加 + レンダリングコンポーネント追加で完結                                                                    |
| **`assertWithinAnnouncementQuota`**                   | Email Delivery も同 quota 枠で計上(別 quota 枠を作らない)。channel 数に依存しない設計                                                                                                |

### MVP で素地として作らない方が良いもの(よくある罠)

- ❌ **`Subscriber` テーブルだけ先に作る**:使い道がない空テーブルは migration 履歴が無駄、v1.x で同時作成が容易
- ❌ **`Delivery.channel` enum に `EMAIL` だけ先に追加**:値だけあってサービス無しは「実装漏れバグ」 と区別がつかない
- ❌ **`subscribe_form` LP ブロック型だけ先に作る**:「動かないフォーム」 が公開ページで誤動作

### v1.x で追加する Prisma schema(参考)

```prisma
/// v1.x で追加予定。LP 購読フォームから登録されたメール購読者(ADR-014 v1.x)。
model Subscriber {
  id                String   @id @default(cuid())
  tenantId          String
  projectId         String
  email             String
  status            SubscriberStatus     // PENDING | CONFIRMED | UNSUBSCRIBED
  confirmToken      String?  @unique     // double opt-in、64B random、CONFIRMED 後 NULL
  confirmedAt       DateTime?
  unsubscribeToken  String   @unique     // unsubscribe URL、64B random
  unsubscribedAt    DateTime?
  source            String?              // 流入元の任意ラベル
  createdAt         DateTime @default(now())

  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  project  Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([tenantId, projectId, email])
  @@index([tenantId, status])
  @@index([projectId, createdAt])
}

enum SubscriberStatus { PENDING CONFIRMED UNSUBSCRIBED }
```

### v1.x で追加する API endpoints(参考)

| Method | パス                                                                          | 用途                                                                       |
| ------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| POST   | `/public/projects/:projectId/subscribers`                                     | LP 購読フォームから登録(未認証可)→ PENDING で INSERT + 確認メール送信  |
| GET    | `/public/subscribers/confirm/:confirmToken`                                   | 確認メールの link → CONFIRMED に更新                                       |
| GET    | `/public/subscribers/unsubscribe/:unsubscribeToken`                           | unsubscribe link → UNSUBSCRIBED に更新                                     |
| GET    | `/workspaces/:slug/projects/:projectId/subscribers`                           | 一覧(購読者管理画面用)                                                    |
| DELETE | `/workspaces/:slug/projects/:projectId/subscribers/:id`                       | 削除(物理削除、GDPR 対応)                                                |

### v1.x で `ANNOUNCEMENT_GEN` の Tool スキーマ拡張(差分)

```typescript
// MVP
export type AnnouncementDrafts = {
  twitter: { text: string };
  blog: { title: string; body: string; summary: string };
};

// v1.x(email を追加するだけ、既存フィールドは変更しない)
export type AnnouncementDrafts = {
  twitter: { text: string };
  blog: { title: string; body: string; summary: string };
  email: {
    subject: string;
    htmlBody: string;
    plainTextBody: string;
  };
};
```

### 特送法対応の予定方針(v1.x 法務レビュー前)

| 要件                          | v1.x 実装方針                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| 送信者情報                    | React Email の `SubscriberEmailLayout` 共通レイアウトの footer に **強制表示**                          |
| 配信目的の明示                | 件名 or リード文に「【お知らせ】」 等のプレフィックス + footer に自動付与                                |
| unsubscribe link              | footer に `https://shipyard.app/public/subscribers/unsubscribe/{token}` を **強制挿入**、1 クリック解除 |
| ワンクリック unsubscribe(RFC) | メールヘッダに `List-Unsubscribe: <URL>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`        |
| 送信者ドメイン認証            | 既存 Resend の DKIM / SPF / DMARC 設定を流用(Day 17 + Week 5 本番 DNS で対応済)                       |
| 件名に「広告」 マーク         | 法務レビュー結果次第                                                                                    |

### MVP 実装で守るべき境界線(v1.x が新規追加のみで済むように)

1. **`Delivery` の Service 層は channel 別 if/else を Service ファイル内で完結**
2. **`assertWithinAnnouncementQuota` は channel 数に依存しない**(Announcement 単位でカウント、Delivery が 2 でも 3 でも 1 回分)
3. **`Feature.ANNOUNCEMENT_GEN` クレジット重み = 4 cr 固定**(channel 数に応じて変動させない)
4. **`assertWithinAnnouncementQuota` のエラーメッセージで「Twitter とブログ」 と固有名を出さない**

---

## 6. エラーハンドリング / テスト戦略 / 工数内訳

### エラーハンドリング戦略

#### 1. AI 生成失敗(`ANNOUNCEMENT_GEN`)

| エラー                                       | 対応                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Tool Use ブロック欠落 / Anthropic API 502    | `AIBadResponseError`(502)→ `classifyAiApiError` で `bad_response` 分類 → ダイアログ内 Alert で再試行案内       |
| `twitter.text` が 280 字超(LLM の規約破り)   | Service 層で長さチェック → 502 `AIBadResponseError`(LLM 制御失敗、自動再生成はしない)                          |
| AI クレジット枠超過                          | `assertWithinAnnouncementQuota` で 403 → `classifyAiApiError` で `quota` 分類 → アップグレード CTA を表示       |
| Anthropic API タイムアウト                   | NestJS の Axios timeout(60 秒)→ 504 → `bad_response` 扱い                                                      |

#### 2. Twitter API 失敗(`POST /2/tweets`)

| HTTP / 状況                       | 対応                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 401(token 失効)                  | 即座に refresh フロー実行 → 再 POST。refresh も失敗なら UI に「再連携してください」 表示                                          |
| 403(suspended / 規約違反)        | Delivery.status = FAILED + error「X アカウントが利用制限を受けています」 + 再実行ボタン disabled                                  |
| 429(rate limit)                  | Delivery.status = FAILED + error「X 投稿の上限に達しました(月 {limit} 件)」 + 「{retryAfter} 後に再実行可」                     |
| 500-503(X 側障害)               | Delivery.status = FAILED + 「X 側で一時的な障害が発生しています」 + 再実行ボタン有効                                              |
| ネットワークタイムアウト         | 同上(冪等性は X 側で担保されないため自動リトライしない)                                                                          |

Delivery.error に **ユーザー向け文言**(日本語)を保存。原文の Twitter API response は CloudWatch Logs に残し DB には保存しない(PII / トークン漏洩防止)。

#### 3. Blog 公開失敗

| 状況                              | 対応                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| slug 衝突(同 Project 内)         | `@@unique([tenantId, projectId, slug])` で 409 → 「この slug は既に使われています」 を inline 表示 |
| body 0 字 / title 0 字            | DTO validation で 400 → 編集画面 inline エラー                                                    |
| BlogPost INSERT 中に DB 障害      | Delivery.status = FAILED + error「データベースに保存できませんでした」 + 再実行ボタン有効          |
| 公開ページ生成失敗(Next.js 側)  | Vercel が 500 を返す → 公開済 BlogPost.publishedAt は変更しない(ロールバック不要)                |

#### 4. OAuth callback 失敗

| 状況                                  | 対応                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| state Redis 不在(期限切れ / リプレイ) | 400「リンクが無効か期限切れです」 → 設定画面へリダイレクト(エラー toast)                                     |
| `code` で token 交換失敗(400 / 401)  | 同上 + ログに詳細記録                                                                                          |
| scope 不足(`tweet.write` 欠落)       | 400「必要な権限が付与されていません」 + ログ + 再認可へのリンク                                                |
| `xUserId` 重複                        | 409「この X アカウントは既に別のワークスペースで連携されています」 → 設定画面へ                                |
| AES-GCM 暗号化失敗(master key 不正) | 500(ブート時 fail-fast していれば実行時には起きない) + アラート通知(Day 39 の SNS + CloudWatch Alarm)     |

#### 5. 部分実行失敗の扱い

Delivery は channel ごとに独立した status を持つため、**部分成功を許容**:

- Twitter 成功 + Blog 失敗 → Announcement.status = `DONE` または `EXECUTING`(両 Delivery 評価で「すべて SENT」 = DONE)。ユーザーは Blog だけ再実行ボタンで再試行
- どちらかが SCHEDULED 中なら Announcement.status = `EXECUTING`
- ステータス遷移:`DRAFT`(AI 生成前 / Delivery 0 件)→ `READY`(AI 生成済 / 未実行)→ `EXECUTING`(1 つ以上実行中 or 失敗あり)→ `DONE`(すべて SENT)

### テスト戦略

#### 1. 単体テスト(`*.spec.ts`、jest 既存)

| 対象                                       | 内容                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `TokenEncryptionService`                   | encrypt → decrypt の往復、IV 毎回ランダム、不正な暗号文 → 例外                                |
| Tool Use 抽出ヘルパー                      | Tool Use なし / 空 input / 不正 input → `AIBadResponseError`                                 |
| Delivery channel 別 dispatcher             | TWITTER → twitterClient.postTweet 呼び出し、BLOG → BlogPost.publish 呼び出し(モック)        |
| `assertWithinAnnouncementQuota`            | Free フォールバック 403 / トライアル 200 / Pro 上限内 200 / Pro 上限到達 403                |
| Announcement status 遷移ロジック           | DRAFT → READY → EXECUTING → DONE / 失敗時 EXECUTING で停留                                  |

#### 2. E2E テスト(`/run-e2e` skill、実 API 叩く既存パターン)

| シナリオ                                                              | 実 API or モック                                                                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Announcement CRUD                                                     | 実 DB                                                                                                     |
| ANNOUNCEMENT_GEN 実行(twitter + blog 両出力、AIUsage 記録 2 件)        | 実 Anthropic API(Sonnet 4)+ 実 DB                                                                       |
| Delivery 実行 — TWITTER 成功                                          | **テスト用 X アカウント**で実 API 叩く → 実 tweet 投稿 → tweet id 記録 → 手動削除                        |
| Delivery 実行 — TWITTER 401(token 失効)                              | **モック**:`TwitterClient` を test double に差し替え(refresh フロー検証)                              |
| Delivery 実行 — BLOG 公開                                             | 実 DB + 公開ページの HTTP fetch で 200 / title 確認                                                        |
| OAuth フロー全体                                                      | **手動 E2E のみ**(X が redirect する性質上、自動化困難)→ runbook に手順記載                            |
| Token 暗号化往復                                                      | 単体テストで担保 + E2E は「DB の accessToken カラムが base64url の暗号文として保存」 を確認のみ          |
| プラン制限(Free フォールバック 403 / トライアル 200 / Pro 上限 403) | 実 DB + AIUsage 偽データ作成(PRODUCT_DIAGNOSIS と同パターン)                                            |
| 部分実行失敗(Twitter 成功 + Blog 失敗)                              | **モック**:BlogPost.publish を強制失敗 → Announcement.status = EXECUTING 残留 + 再実行で SENT 確認     |
| 認可マトリクス(VIEWER 閲覧可 / VIEWER 作成不可 / OWNER 切断のみ)    | 実 DB + JWT 切替                                                                                          |

E2E 結果サマリは `.claude/output/run-e2e/2026-MM-DD-day{56,57,58,59}-announcement.md` に集約。

#### 3. セルフレビュー(MVP 必須、既存 Day 49 パターン)

各 Day で以下を実施:

- `/reviewing-own-changes` skill 起動(`code-reviewer` agent + `security-reviewer` agent 並列)
- セキュリティ重点項目(本機能特有):
  - Token 復号後の文字列が **ログに出ない**(`logger.debug(account)` で token フィールドが redacted されている)
  - OAuth state が **使い捨て**(Redis から DEL されていることをコードレビュー)
  - 公開ページ(`/p/.../blog/...`)から **テナント内部フィールドが漏れていない**(BlogPost の `deliveryId` / `tenantId` 等を返さない)
  - `safeHref` が AI 生成 URL と Tweet 本文内の URL に **両方** 適用されている

#### 4. 手動 E2E(MVP 公開前、Day 58-59)

- 実 X アカウント(`shipyard_official` 想定)で OAuth → 実 tweet → 削除 の往復
- 公開ブログページのブラウザ確認(Chrome / Safari / モバイル Safari、OG プレビュー / OGP デバッガ)
- 利用規約 update 同意導線の確認

### 工数内訳(Day 56-59)

| Day      | 担当                                                                                                                                                                                                   | 目安工数 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| **Day 56** BE 基盤 + データモデル | `Announcement` / `Delivery` / `BlogPost` / `TwitterAccount` model + migration / `Feature.ANNOUNCEMENT_GEN` 追加 migration / `TokenEncryptionService` 実装 + 単体テスト / `assertWithinAnnouncementQuota`(`AIUsageService` に追加)/ DTO 一式 | 1 Day    |
| **Day 57** BE Service + Controller | `AnnouncementService`(CRUD + generate + executeDelivery)+ `AnnouncementController`(7 endpoints)/ `IntegrationsTwitterController`(OAuth authorize / callback / list / delete = 4 endpoints)/ `TwitterAuthService` + `TwitterClient`(refresh + postTweet) / `BlogPostController`(管理画面 3 + 公開 API 1 = 4 endpoints)+ `BlogPostService` / **計 15 endpoints / 4 Controller**、認可マトリクス / E2E 一式 / セルフレビュー(`security-reviewer` 重点) | 1 Day    |
| **Day 58** FE 編集動線              | `/w/.../announcements` 一覧 + 新規 Dialog / `/w/.../announcements/:id` 編集ページ(Twitter タブ / Blog タブ / Delivery ステータスパネル)/ AI 生成ダイアログ(`AnnouncementGenerateDialog`)/ Server Action 一式 / Project Card に「告知配信」 追加 | 1 Day    |
| **Day 59** FE 連携 + 公開ページ + 公開 | `/w/.../settings/integrations`(Twitter 連携 UI)/ `/p/:slug/:projectId/blog/:postSlug` 公開ブログページ(generateMetadata + canonical + Clerk middleware 除外)/ Twitter 連携 runbook 作成 / 利用規約 update / **公開リリース** | 1 Day    |

**バッファ**:Day 54-55 のバッファを本機能の延長で吸収。Twitter Developer App の本番審査が長引いた場合は Day 59 の公開を 1 Day 遅らせる。

### 公開チェックリスト(Day 50-51 本番化 + Day 59 公開時)

| 項目                                              | 期限     |
| ------------------------------------------------- | -------- |
| Twitter Developer App 申請 + 承認(本番)         | Day 50   |
| App の callback URL に prod / dev 両 URL を登録   | Day 50   |
| `TWITTER_TOKEN_ENCRYPTION_KEY` を Secrets Manager に投入(`openssl rand -base64 32`)| Day 50   |
| `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` を Secrets Manager に投入 | Day 50   |
| Upstash Redis(state 保管用)の prod インスタンス確認 | Day 50   |
| 利用規約 update(投稿はユーザー責任、X 規約への同意)| Day 59   |
| `/p/.../blog/.*` を `robots.txt` で allow + sitemap に追加 | Day 59   |
| 公開後 24h で実 tweet × 1 / 実 blog × 1 を Shipyard 自身でドッグフーディング | Day 59   |

### 公開後の監視(Day 59 以降)

- CloudWatch メトリクス:
  - `announcement.generate` 成功率 / レイテンシ p95
  - `delivery.execute` channel 別成功率(TWITTER / BLOG)
  - Twitter API 401 / 403 / 429 のレート
  - Token refresh 成功率
- AWS Budgets:Anthropic API + OpenAI API の月次予算を 50% / 80% / 100% で SNS 通知

---

## 次のステップ

1. **本 Spec doc のユーザーレビュー** — 設計の見落としや訂正点を確認
2. **`writing-plans` skill 起動** — 実装計画(タスク分解 + 依存関係 + 完了基準)を作成
3. **実装着手** — Day 56 から順次
