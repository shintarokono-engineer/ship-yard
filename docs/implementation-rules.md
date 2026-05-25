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
- 全 AI 呼び出しは `AIUsage` テーブルにテナント単位で記録(Free プラン月 20 回上限の判定にも使う)
- 上限カウントは `Feature.OTHER`(裏方 embedding)を除外(`assertWithinFreeQuota` の where に `feature: { not: OTHER }`)、ユーザー視点の「月 20 回」と一致させる

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
