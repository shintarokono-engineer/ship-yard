# ADR-006: モノレポのディレクトリ構成と DB 層の配置

## ステータス

承認済み(2026-05-07)

## 背景・問題

ADR-001 で Monorepo ツールとして Turborepo + pnpm Workspaces を採用したが、以下を別途決定する必要がある。

- `apps/` と `packages/` の責務分担
- Prisma スキーマと Prisma Client(以下「DB 層」)をどこに配置するか
- フロント↔バック間で共有する型定義をどう管理するか

特に DB 層の配置は将来の保守性・拡張性に大きく影響するため、明示的な ADR として記録する。

関連: ADR-001(技術スタック)、ADR-002(マルチテナント Pool model + Prisma Client Extension)

## 検討した選択肢

### A. `packages/db` に DB 層を配置(共有パッケージ化)

```
apps/api/src/...                # ビジネスロジックのみ
packages/db/prisma/schema.prisma
packages/db/src/index.ts        # PrismaClient + Extension export
```

- 全 consumer(API ハンドラ / Worker / Seed / 管理 CLI / 将来の admin app)が `@shipyard/db` から import
- 型を `@shipyard/types` 経由で `apps/web` からも参照可能

長所:

- 複数 consumer の対応が綺麗(Worker / Seed / CLI が同じ Prisma Client + Extension を再利用)
- ADR-002 の Prisma Client Extension(tenantId 自動注入)を全 consumer で再利用可能
- `apps/web` から Prisma 型を参照可能(モノレポの型同期メリットを最大化)
- migration 実行(CI)の責務が独立、API のデプロイサイクルと分離可能
- Turborepo + Prisma の業界デファクト構成(T3 Turbo / Cal.com / Vercel Commerce 等)

短所:

- workspace が 1 つ増えるためナビゲーションがわずかに複雑
- 単一 consumer しか想定しない場合は若干オーバーエンジニアリング

### B. `apps/api/prisma/` に DB 層を配置(API 内包)

```
apps/api/prisma/schema.prisma
apps/api/src/db/client.ts       # API 内のみで利用
```

長所:

- 構造がシンプル(workspace が少ない、ファイル数も少ない)
- API 内で完結、コードを追いやすい

短所:

- Worker / Seed / 管理 CLI が別ワークスペース化したら再構成が必要
- `apps/web` から Prisma 型を参照すると `apps/* → apps/*` の依存になりモノレポの片方向依存原則に違反
- Prisma Client Extension の再利用が API 内に閉じ、他 consumer が利用しにくい
- migration を CI で独立実行する場合、API のビルド成果物に依存することになる

### C. `packages/types` に Prisma 型を含めて、Prisma 本体は `apps/api/prisma/` に置く(ハイブリッド)

長所:

- 型共有のメリットを得つつ、Prisma 自体は API 内に閉じ込められる

短所:

- 型の二重管理(Prisma 生成型と再エクスポート型の同期)
- Prisma Client Extension の問題は B と同じく未解決
- 構造が複雑、Turborepo 慣例から外れる

## 決定

**選択肢 A(`packages/db` に DB 層を配置)** を採用する。

加えて `apps/` と `packages/` の責務分担を以下とする:

| 階層        | 性質                                              | 配置されるもの                              |
| ----------- | ------------------------------------------------- | ------------------------------------------- |
| `apps/`     | **実行可能アプリケーション**(プロセスを起動)    | `apps/web`(Next.js)、`apps/api`(NestJS) |
| `packages/` | **共有ライブラリ**(他から import される)       | `packages/db`、`packages/ui`、`packages/types` |

依存方向は `apps/* → packages/*` の片方向のみとし、`apps/* → apps/*` および `packages/* → apps/*` は禁止する。

## 理由

### A を採用する核心理由

1. **複数 consumer 対応**: Shipyard では DB を直接利用する consumer が API 以外にも複数存在する(Worker、Seed、管理 CLI、CI のマイグレーション、将来の admin app)。`packages/db` に配置することで全 consumer が同一の Prisma Client + Extension を共有できる
2. **Prisma Client Extension の再利用**: ADR-002 の tenantId 自動注入は Service 層で書かれるべきものではなく、Client 層で構造的に保証する設計。これを全 consumer で享受するためには共有パッケージが必要
3. **型同期の最大化**: モノレポを採用する最大のメリットは「フロント↔バック間の型同期」。Prisma 型を `@shipyard/types` 経由で `apps/web` から参照可能にすることで、API 仕様変更を `apps/web` のビルドエラーで即座に検知できる
4. **業界慣例**: Turborepo 公式テンプレート(`with-prisma`)、T3 Turbo、Cal.com 等のモダン monorepo は全て `packages/db` 配置。副業面談で「一般的な構成を理解している」と語れる

### B を棄却した理由

- 「最初は API のみが利用」という前提が崩れた瞬間に再構成コストが発生する。Shipyard は Day 5 の時点で BullMQ Worker を別プロセスとして稼働させるため、すでに「単一 consumer」の前提が成立しない
- 型共有のメリットを諦めるのは、モノレポを採用する意味が大きく毀損する

### C を棄却した理由

- 型の二重管理(Prisma 生成型と再エクスポート型)が必要になり、変更時の同期コストが高い
- B と同じく Extension の再利用問題が解決されない

### `apps/` と `packages/` の片方向依存原則を採用する理由

- `apps/* → apps/*` を許容すると、片方が起動していないと他方が動かない暗黙の依存が生まれる
- `packages/* → apps/*` を許容すると、共有ライブラリが特定アプリの実装に依存し再利用性が失われる
- 片方向に縛ることで Turborepo のキャッシュ効率も最大化される

## 結果

### 良い影響

- DB 層が共有リソースとして明確に位置付けられ、Worker / Seed / 管理 CLI が同じ Prisma Client + Extension を再利用可能
- Prisma 型を `apps/web` から参照可能になり、API 仕様変更を構造的に検知できる
- migration 実行を API デプロイから分離可能(CI で `pnpm --filter @shipyard/db migrate deploy`)
- 副業面談で「Turborepo + Prisma の標準的な構成 + Pool model の Extension 再利用設計」を一貫して語れる
- 業界標準の構成のため、新規メンバーが参加しても理解が早い

### 悪い影響・リスク

- `packages/db` という追加 workspace が発生し、ファイル探索が若干複雑化(IDE 補完で吸収可能)
- Prisma Client の生成成果物を `packages/db` 配下にコミットするか CI で生成するかの判断が必要(別途決定)
- `apps/web` が Prisma 型に過度に依存すると、フロントとバックの結合度が上がる懸念(対策: `packages/types` に DTO 層を挟む)

### フォローアップ

- Day 5 で `packages/db/prisma/schema.prisma` を作成する際、Prisma Client Extension(tenantId 自動注入)を `packages/db/src/extensions/` に配置する
- Day 5 で `prisma-erd-generator` を `packages/db/prisma/schema.prisma` の generator として組み込む(PROJECT_STATUS.md セクション 9.4 参照)
- Prisma 生成 Client のコミット方針(コミットする / `.gitignore` で除外して CI 生成)を Day 5 着手時に決定
- `packages/types` に Prisma 型の re-export 層を作るか、直接 `@shipyard/db` から import するかを Day 4 着手時に決定
- ESLint カスタムルールで `apps/* → apps/*` および `packages/* → apps/*` の依存を禁止(Day 3 後半の lint セットアップ時)
