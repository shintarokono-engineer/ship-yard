# 実装時に外せない制約

横断的に効く設計制約。**`apps/api/src/**`/`apps/web/src/**`/`packages/db/**` を編集する前に必ず読む\*\*。CLAUDE.md からはこのファイルへのリンクのみ残してある(常時 context に入る量を削るため)。

決定の根拠は ADR-001〜007 を参照。本ファイルは ADR の運用ルール部分を実装目線で集約したもの。

---

## マルチテナント(ADR-002)

- **Pool model**: 全テナント共有 DB、業務テーブルは全て `tenantId` カラムを持つ
- 例外: `User` と `WebhookEvent` はテナントを持たない
- Service 層から `tenantId` を意識せず書けるよう、Prisma Client Extension で自動注入(Day 5 で実装)
- AsyncLocalStorage でリクエストコンテキストを伝搬
- **Raw SQL は原則禁止**。やむを得ず使う場合は `WHERE tenantId = $1` を明示し、ESLint カスタムルール `no-raw-sql-without-tenant-filter` で検出する

## レイヤリング(コントローラ / サービス)

- **コントローラは Prisma を直接呼ばない**。各アグリゲート(Project / ProjectDocument / …)に Service を置き、永続化(`prisma.*`)と `tenantId` の差し込みは Service 層に集約する。コントローラの責務は「認証・所属/権限の確認(`WorkspaceGuard` + `@Roles`)・入出力の整形・Service 呼び出し」まで
- 認証・所属解決・ロール検証は `@UseGuards(ClerkAuthGuard, WorkspaceGuard)` + ハンドラの `@Roles(...)` で宣言的に行い、解決済みの所属情報は `@CurrentWorkspace()` パラメータデコレータで受け取る(`workspaces/:slug/...` ルートの場合)
- path slug ベースのルート(`workspaces/:slug/...`)は ALS のテナントコンテキストを持たないので、Service は引数で受け取った `tenantId` を全クエリの `where`/`data` に明示注入する(自動注入の Client Extension は ALS がある場合のみ効く)

## テナント解決(ADR-003)

- URL は **サブパス方式** `shipyard.app/w/{slug}` に統一(サブドメインではない)
- Next.js middleware で slug を抽出し、API には `X-Tenant-Slug` ヘッダーで伝搬
- 所属していない slug にアクセスした場合は 404(存在の有無を漏らさない)

## 課金(ADR-004)

- Stripe Webhook の Idempotency Key は `event.id`(`WebhookEvent.stripeEventId` ユニーク制約で担保)
- Team プランの人数は Subscription Quantity で表現、メンバー追加時に即時更新
- 解約後は 7 日 grace → 30 日凍結 → 削除

## AI(ADR-005)

- Sonnet 4: 競合調査 / ドキュメント生成 / RAG QA(品質要件が高い場面)
- Haiku 4.5: タスク分解 / チェックリスト生成 / 文章推敲(構造化中心)
- Tool Use は構造化出力が必要な場面のみ。利用箇所はコードコメントで理由を残す
- pgvector + text-embedding-3-small(1536 次元)、HNSW インデックスで RAG
- 全 AI 呼び出しは `AIUsage` テーブルにテナント単位で記録(プラン別 AI クレジット上限の判定にも使う、ADR-012)
- 上限は AI クレジット制(Haiku 4.5=1cr、Sonnet 4=3cr、`Feature.OTHER`=0cr)。`AIUsage.credits` 列の月次合計が Free=0(停止)/ Pro=300 / Team=seats×800 を超えたら 403(`assertWithinPlanCredits`)。`OTHER` は 0cr で記録されるため自然に上限から除外され、ユーザー視点の「残りクレジット」と一致する

## フロントエンド(Next.js App Router / React)

- **`<body>` には固定属性のみ置く**(固定 `className` は OK。theme 切替・動的 class・状態フラグ等の動的属性を `<body>` に付けない)
  - 理由: ブラウザ拡張(ColorZilla / Grammarly 等)が `<body>` に属性を注入することによる hydration mismatch を、`apps/web/src/app/layout.tsx` で `suppressHydrationWarning` を付けて抑制している。この prop は **1 階層分のあらゆる属性差分を全て無視する** ため、`<body>` 経由で動的状態を扱うと本物のバグも黙殺される
  - 動的な状態(theme / lang 切替 / 装飾 class 等)は **`<html>`** か中の Client Component で扱う
  - 例外: `next-themes` 等で `<html>` に状態を付ける場合は `<html>` 側にも `suppressHydrationWarning` を付ける(`<body>` 同様の理由)

## 日付・時刻の扱い

- **日付・時刻の生成・パース・計算・タイムゾーン処理は `dayjs` を使う**(`new Date(...)` での日付演算・UTC 操作・Unix 秒変換は避ける)
  - `apps/api/src/common/time.ts` で UTC プラグインを extend 済みの `dayjs` を re-export しているので、API 側はそこから import する(例: 月初は `dayjs.utc().startOf('month').toDate()`、Unix 秒は `dayjs.unix(sec).toDate()`)
  - 例外: 「現在時刻のスナップショット」程度の `new Date()`(`createdAt` のデフォルトや `processedAt` 等)は許容

## マジックナンバー / 設定値

- 上限回数・モデル ID・単価・為替・タイムアウト等、**変更されうる値は定数ファイルに集約**する(コード中に直書きしない)。例: AI 関連は `apps/api/src/ai/ai.constants.ts`
- schema の enum がある値はマジック文字列ではなく enum(`@shipyard/db` 経由)を使う(`'PRO'` ではなく `Plan.PRO`)

## 環境変数を追加するとき(本番だけ壊れる事故の防止)

環境変数は **`.env.example` に足しただけでは本番に届かない**。ローカルと本番で読み込み経路が完全に別なので、**追加先を必ず 3 分類で判断する**こと。

### 前提: ホスティングが 2 つに分かれている

```
ブラウザ
   │
   ▼
Vercel(Web / Next.js)          ← 環境変数は Vercel ダッシュボード
   │  サーバー間通信
   ▼
AWS App Runner(API / NestJS)   ← 環境変数は Secrets Manager + apprunner.tf
   │
   ▼
AWS RDS
```

**Vercel は Secrets Manager を読めず、App Runner は Vercel の環境変数を読めない。** 互いに独立している。

反映タイミングも異なる。どちらも「値を更新しただけでは反映されない」が理由が違う。

|            | 反映方法                             | 理由                           |
| ---------- | ------------------------------------ | ------------------------------ |
| Vercel     | **再デプロイ**                       | ビルド成果物に埋め込まれる     |
| App Runner | **`aws apprunner start-deployment`** | 起動時にシークレットを解決する |

### 現在の定義場所(一覧)

**API(NestJS / App Runner)— 機密 10 件**: `infra/prod/secrets.tf` の `app_secret_keys` に列挙 → Secrets Manager に実値を手動投入 → App Runner が起動時に注入。

`DATABASE_URL`(アプリ専用ロール `shipyard_app`) / `CLERK_SECRET_KEY` / `CLERK_WEBHOOK_SECRET` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAM` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `RESEND_API_KEY`

**API — 非機密 2 件**: `infra/prod/apprunner.tf` の `runtime_environment_variables` で直接定義(Secrets Manager はシークレット単位で課金されるため機密でない値は入れない)。

`APP_BASE_URL`(= `https://${var.domain_name}`) / `MAIL_FROM`(= `var.mail_from`)

**API — その他 1 件**: `PORT` は `apps/api/Dockerfile` の `ENV PORT=3000`。`apprunner.tf` の `port = "3000"` と一致させる。環境ごとに変える値ではないので env 管理しない。

**Web(Next.js / Vercel)— 8 件**: Vercel ダッシュボード(Production)のみ。

| 変数                                                               | 参照のされ方                                                                                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_URL`                                                          | `lib/api/client.ts` が直読み。全 API 呼び出しのベース URL。**未設定だと即 throw**                                                                           |
| `SITE_URL`                                                         | `lib/site-url.ts`。OG 画像 / メタデータ / robots / sitemap の絶対 URL。**未設定でもエラーにならず Vercel 既定ドメインにフォールバックする**ので気付きにくい |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`                                | **Clerk SDK が暗黙に読む**(コードに登場しない)                                                                                                              |
| `CLERK_SECRET_KEY`                                                 | Clerk SDK が暗黙に読む。`auth()` / `auth.protect()` のサーバー側検証                                                                                        |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL`                   | Clerk SDK が読む。middleware のリダイレクト先。**未設定だと Clerk ホストの Account Portal へ飛ぶ**                                                          |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `_SIGN_UP_...` | Clerk SDK が読む。認証後の既定遷移先                                                                                                                        |

- **`NEXT_PUBLIC_` 付きはビルド時にバンドルへ埋め込まれブラウザから見える**。機密は絶対に付けない
- `API_URL` に `NEXT_PUBLIC_` を付けないのは意図的。ブラウザから直接 API を叩かせず Server Component / Server Action 経由に限定する設計
- **`CLERK_SECRET_KEY` だけは Vercel と Secrets Manager の両方に同じ値を置く**(Web は JWT を発行・取得、API は受け取った JWT を検証。役割が違うだけで同一インスタンスを指す必要がある)

**ローカル開発**: `apps/api/.env.local` / `apps/web/.env.local` / `packages/db/.env`(Prisma CLI 専用)。いずれも gitignore 済みで、`.dockerignore` でもイメージから除外している(本番コンテナに `.env` は存在しない)。

### 判断フロー

```
その環境変数は誰が読む?
├ API(NestJS)が読む
│  ├ 機密(APIキー / シークレット / 接続文字列)
│  │   → ① apps/api/.env.example
│  │     ② apps/api/.env.local(ローカル実値、gitignore 済)
│  │     ③ infra/prod/secrets.tf の `app_secret_keys`   ← 忘れると本番だけ壊れる
│  │     ④ Secrets Manager への実値投入(手動)          ← 忘れると REPLACE_ME のまま起動
│  └ 非機密(URL / フラグ等)
│      → ① apps/api/.env.example
│        ② apps/api/.env.local
│        ③ infra/prod/apprunner.tf の `runtime_environment_variables`
│          (環境ごとに変える値なら variables.tf にも変数を足す)
└ Web(Next.js)が読む
   → ① apps/web/.env.example
     ② apps/web/.env.local
     ③ Vercel の環境変数(Production)  ← ビルド時に取り込まれるため追加後は再デプロイが必要
```

補足:

- **③ `app_secret_keys` に足せば App Runner への配線まで完了する**。`apprunner.tf` が `for k in local.app_secret_keys` で `runtime_environment_secrets` を生成しているため、apprunner.tf 側の編集は不要
- **機密でない値を Secrets Manager に入れない**。シークレット単位で月額課金が発生する
- `NEXT_PUBLIC_` 接頭辞の値は**ブラウザに露出する**ので機密を入れない
- **Secrets Manager の値は App Runner の起動時に解決される**。値を更新しただけでは反映されず、`aws apprunner start-deployment` で再デプロイが必要
- `packages/db/.env` の `DATABASE_URL` は Prisma CLI(`migrate` / `generate`)専用の**ローカル用**。本番の migration は環境変数で明示的に渡す

**実績**: 2026-07-25 に `CLERK_WEBHOOK_SECRET` が ③ に無いまま放置されていた不具合を発見(`.env.example` とコードにはあったが `secrets.tf` に無く、本番の `POST /webhooks/clerk` が 500 を返し続けてユーザープロビジョニングが止まる状態だった)。本番構築前に気付けたのは偶然なので、上記フローで機械的に確認すること。
