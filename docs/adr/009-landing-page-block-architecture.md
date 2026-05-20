# ADR-009: LP ブロック型アーキテクチャ(アプリ内 LP 作成・編集・公開)

## ステータス

承認済み(2026-05-20)

## 背景・問題

ADR-005(AI 戦略)では DRAFT_GEN の生成対象に「ランディングページ(LP)」を含め、`draft-gen.service.ts` は LP を **Markdown の訴求文**として出力する設計だった。

しかし 2026-05-19 のセッションでユーザーから次の指摘を受けた(§9.5)。

- 「LP は Markdown ではなく、システム内で作成して、ユーザーがそのまま使用できるようにしたい」
- 現状の「Markdown 本文を返すだけ」では、ユーザーは Framer / Webflow / 自前 React 等へ手作業で流し込む必要があり、個人開発者の手間が本質的に変わらない

そこで Shipyard 内で **LP を作成・編集・公開まで完結させる**(Framer / Carrd / Typedream と同じ「アプリ内 LP 作成 SaaS」モデル)方針が確定した。これを実現するには、LP を構造化データとして保持する必要がある。

### 解決すべき設計課題

1. **データモデル**: LP の構造化データ(ブロック配列)をどこに保存するか
2. **AI 生成**: DRAFT_GEN の LP 生成を Markdown 文字列出力からブロック構造出力へ変える
3. **編集 UI**: アプリ内でブロックを編集する手段
4. **公開**: ログイン不要で閲覧できる公開 URL と公開状態管理

### LP は既存 `ProjectDocument` と性質が異なる

| 観点 | 既存 `ProjectDocument` | ブロック化後の LP |
| --- | --- | --- |
| データ構造 | Markdown 文字列(`content: String`) | ブロック配列 JSON |
| 編集モデル | append-only(編集 = `MAX(version)+1` の新行 INSERT、Day 10) | mutable(同じ LP を上書き編集) |
| 公開 | 非公開(ログインユーザーのみ) | 公開 URL `/p/{slug}/{projectId}` + 公開トグル |
| 用途 | ドキュメント(読み物) | プロダクト(ユーザーが公開して使う成果物) |

この性質差をデータモデルでどう扱うかが本 ADR の核心である。

関連:ADR-005(AI 戦略)、ADR-008(RAG コーパス戦略)、§9.5(LP ブロック化 + 公開 URL)

## 検討した選択肢

LP の構造化データ(ブロック配列)の保存先について 3 案を検討した。

### A. `ProjectDocument.content` を Json 化

- 概要:`content` カラムの型を `String` → `Json` に変更。README 等は `{ markdown: "..." }`、LP は `[{ type: "hero", ... }]` を入れる。`publishedAt` 列を追加
- 長所:新テーブル不要。version 履歴・RAG・DRAFT_GEN の枠組みを流用できる
- 短所:
  - **1 カラムに 2 つの責務が同居**。`content` の型が `type` フィールドに依存する判別ユニオンになり、全参照箇所で型分岐が要る
  - 既存の全 ProjectDocument(README / LP / 他)の `content` を `{ markdown }` 形へ変換する migration が必要
  - append-only が LP 編集に過剰(hero 見出しの小修正でも version が乱発)
  - RAG embedding が LP の JSON 構造ノイズを拾うため、LP だけブロックから本文抽出する特別処理が要る
  - `publishedAt` 列が全 type に付くが README 等では永遠に null

### B. `LandingPage` 専用テーブル新設

- 概要:LP 専用テーブルを新設。`ProjectDocument` は一切変更しない
- 長所:
  - **関心の分離**。LP(ブロック構造 + mutable 編集 + 公開可能)と ProjectDocument(Markdown + append-only + 非公開)を別テーブルにし、それぞれの設計が素直になる
  - `updatedAt` での上書き編集が LP の「編集して公開」体験に一致。version 乱発がない
  - `publishedAt` が専用列。`ProjectDocument` が汚れない
  - `blocks` は単一型(ブロック配列)。型分岐が不要
  - LP を RAG 対象に含めない判断を取れば(MVP)、embedding の特別処理が不要
  - 既存データ移行ゼロ(`ProjectDocument` を触らないためリグレッションリスク最小)
- 短所:
  - 新テーブル + migration + `LandingPageService` + `LandingPageController` + Prisma model 追加。実装ボリュームは 3 案で最大
  - DRAFT_GEN の LP 生成だけ生成先テーブルが分岐する

### C. `ProjectDocument` に `blocks` 列追加

- 概要:`content`(既存)を残したまま `blocks: Json?` 列を追加。LP type のときだけ `blocks` を使う
- 長所:新テーブル不要。既存データ移行不要(`content` を触らない)
- 短所:
  - **sparse column(疎なカラム)**。LP 行は `content` 空・`blocks` 使用、README 行は逆。どの列が有効かが `type` 依存になり A と同じ型分岐地獄
  - append-only と LP 編集の不一致(A と同じ)
  - `publishedAt` 列が全 type に付く(A と同じ)
  - A と B の短所を中途半端に併せ持つ(新テーブルを避けた代償が「使われない列」)

## 決定

**B 案を採用する**:`LandingPage` 専用テーブルを新設し、LP のブロック構造・公開状態・編集をそこに集約する。`ProjectDocument` は一切変更しない。

### データモデル

```prisma
model LandingPage {
  id          String    @id @default(cuid())
  tenantId    String                        // マルチテナント(ADR-002 Pool model)
  projectId   String    @unique             // 1 プロジェクト = 1 LP
  blocks      Json                          // ブロック配列(下記スキーマ)
  publishedAt DateTime?                      // null = 非公開 / 値あり = 公開中
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt           // mutable 編集(append-only ではない)

  tenant  Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}
```

- `projectId @unique`:**1 プロジェクト = 1 LP**(MVP)。複数 LP 管理は v2 候補
- `publishedAt`:公開トグル。`null` で非公開、値があれば公開中(公開日時も兼ねる)
- `onDelete: Cascade`:プロジェクト削除時に LP も連鎖削除(`ProjectDocument` / `ChecklistItem` と同じ)

### ブロックスキーマ(MVP 最小 5 種 + footer 任意)

`blocks` は次の判別ユニオン配列。各ブロックは `type` で判別する。

| ブロック | フィールド |
| --- | --- |
| `hero` | `heading` / `sub` / `ctaText` / `ctaHref` / `image?` |
| `features` | `title` / `items[]`(各 `icon` / `title` / `body`) |
| `stats` | `items[]`(各 `value` / `label`) |
| `testimonial` | `quote` / `name` / `role` / `avatar?` |
| `cta` | `heading` / `buttonText` / `buttonHref` |
| `footer`(任意) | `copyright` / `links[]` |

ブロックスキーマは AI Tool Use の `input_schema`、編集 UI のフィールド、レンダリングコンポーネントの 3 箇所で共有するため、TypeScript の型定義を単一の真実の源とする(配置先は実装時に決定、`packages` 共通化も検討)。

### `ProjectDocument.LANDING_PAGE` type の処遇

LP は本 ADR で `LandingPage` テーブルへ移るため、`ProjectDocument` の `LANDING_PAGE` type を AI 生成対象から外す:

- `GENERATABLE_DOC_TYPES`(`ai.constants.ts` / `types.ts`)から `LANDING_PAGE` を**除外**する。LP の AI 生成は `LandingPage` + `submit_landing_page` ツールに一本化
- `DocType.LANDING_PAGE` enum 自体は schema に残す(既存データ・将来の互換のため削除しない)
- これは Day 29 で `LANDING_PAGE` を `GENERATABLE_DOC_TYPES` に含めた変更を一部巻き戻す形になる(Day 29 → Day 30 で連続するため手戻りは最小)

### AI 生成(`submit_landing_page` ツール)

- `draft-gen.service.ts` に LP 専用の Tool Use 経路を追加(または LP 専用 Service へ分離、実装時に判断)
- `submit_landing_page` ツールの `input_schema` でブロック配列の型を定義し、Sonnet 4 にブロック構造の JSON を直接生成させる
- LP 用 system prompt を「Markdown 本文」→「ブロック構造」へ書き換え

### 公開 URL アーキテクチャ

- 公開ページ:`apps/web/src/app/p/[slug]/[projectId]/page.tsx` を新設
- `apps/web/src/middleware.ts` で `/p/*` を Clerk 認証から除外(`/invite/*` と同じ publicRoutes 方式)
- `publishedAt` が `null` の LP、または存在しない `projectId` は `notFound()`(404)
- Next.js `generateMetadata` で OG メタ(タイトル / description は hero ブロックから合成、og:image は MVP では固定画像)
- レンダリング:`apps/web/src/components/lp-blocks/` に `<HeroBlock>` `<FeaturesBlock>` `<StatsBlock>` `<TestimonialBlock>` `<CtaBlock>` を実装。プレビュー(編集画面)と公開ページで同じコンポーネントを共用

### 編集 UI スコープ(MVP)

- 各ブロックのテキストフィールド編集のみ
- ブロックの**並び替え / 追加 / 削除は v2**(MVP は AI 生成時のブロック構成 + 順序を固定)
- 保存は mutable 上書き(`LandingPage.blocks` を更新、`updatedAt` 自動更新)

### Phase 構成と MVP 範囲

| Phase | 内容 | 工数 | MVP / v2 |
| --- | --- | --- | --- |
| 1 | LP ブロック化(JSON 化 + AI Tool Use + アプリ内プレビュー / 編集 UI) | 3 日 | ✅ MVP(Day 30-32) |
| 2 | 公開 URL(`/p/{slug}/{projectId}` + 公開トグル + OG メタ) | 1.5 日 | ✅ MVP(Day 33) |
| 3 | 静的 HTML エクスポート(ZIP ダウンロード) | 2.5 日 | ❌ v2 |
| 4 | カスタムドメイン(`your-product.com` を Shipyard に向ける) | 大 | ❌ v2 |

実装の Day 配分(§6 Week 4 末):

| Day | 内容 |
| --- | --- |
| 30 | Phase 1(1/3):`LandingPage` migration + ブロック型定義 + `submit_landing_page` ツール + LP 生成経路 |
| 31 | Phase 1(2/3):`lp-blocks/` レンダリングコンポーネント + アプリ内プレビュー UI |
| 32 | Phase 1(3/3):編集 UI(各ブロックのテキストフィールド編集 + mutable 保存) |
| 33 | Phase 2:公開 URL `/p/{slug}/{projectId}` + middleware 認証除外 + `publishedAt` 公開トグル + OG メタ |

## 理由

### B 案を採用する根拠

- **関心の分離**:LP(ブロック構造 / mutable 編集 / 公開可能)と `ProjectDocument`(Markdown / append-only / 非公開)は性質が根本的に異なる。同居させると型・列・履歴ポリシーがすべて中途半端になる
- **既存コードへの非影響**:Day 8〜29 で積み上げた `ProjectDocument` 系コード(DRAFT_GEN / RAG / version 履歴 / documents 画面)に一切手を入れない。リグレッションリスクが最小
- **mutable 編集の自然な表現**:LP の「編集して公開」は `updatedAt` 上書きが素直。append-only を LP に適用すると version が無意味に乱発する
- **RAG の単純化**:MVP では LP を RAG 検索対象に含めない(RAG が参照すべきは過去の README 等)。これにより embedding の特別処理が不要。将来 LP を RAG ソースにする場合も、専用テーブルなら拡張で対応できる
- **実装コストは許容範囲**:3 案で最もボリュームが大きいが、各部分が独立しており、MVP で 4 Day(Day 30-33)を確保済み

### A 案・C 案を棄却する理由

- A:`content` カラムの型が `type` 依存の判別ユニオンになり、全参照箇所に型分岐が伝播。既存データの migration も必要で、リグレッションリスクが高い
- C:sparse column により「使われない列」が生まれ、A の型分岐問題も解決しない。A と B の短所を中途半端に併せ持つ

## 結果(Consequences)

### 良い影響

- ユーザーが Shipyard 内で LP を作成 → 編集 → 公開まで完結でき、外部ツールへの手作業流し込みが不要になる(§9.5 のユーザー要望を満たす)
- `ProjectDocument` 系の既存機能が無影響のまま LP 機能を追加できる
- ブロックスキーマを TypeScript 型で一元管理し、AI 生成・編集 UI・レンダリングの 3 箇所で整合が取れる
- 公開 URL により「個人開発者がプロダクトの LP を即座に持てる」という Shipyard の提供価値が具体化する

### 悪い影響・リスク

- **DRAFT_GEN の生成経路が 2 系統に分岐**(Markdown 系 ProjectDocument / ブロック系 LandingPage):
  - 対策:LP 生成は専用ツール `submit_landing_page` + 専用経路に切り出し、Markdown 系と明確に分離する
- **公開 URL の安全性**(ログイン不要で誰でも閲覧可能):
  - 対策:`publishedAt` が null の LP は 404。公開ページは読み取り専用。CSP / セキュリティヘッダ、rate limit は Vercel 標準で MVP は十分
- **公開後の slug 変更による URL 切れ**:
  - 対策:MVP では slug 変更時の挙動を「旧 URL は 404」で割り切る。301 redirect / 旧 URL 保持は v2 で検討
- **編集 UI の並び替えを v2 送りにした際の操作性**:
  - 対策:AI 生成時のブロック構成・順序をそのまま使う前提。順序固定で MVP が成立するかは Day 32 で要検証
- **`GENERATABLE_DOC_TYPES` から `LANDING_PAGE` を外す**:Day 29 で追加したばかりの変更を一部巻き戻す:
  - 対策:Day 29 → Day 30 が連続するため手戻りは最小。`DocType.LANDING_PAGE` enum 自体は残すため既存データは壊れない

### フォローアップ

#### Day 30-33 で実施(本 ADR の実装)

- `LandingPage` テーブルの migration
- ブロック型定義(TypeScript)+ `submit_landing_page` ツール + LP 生成経路
- `lp-blocks/` レンダリングコンポーネント + プレビュー UI + 編集 UI
- 公開 URL `/p/{slug}/{projectId}` + middleware 認証除外 + 公開トグル + OG メタ
- `GENERATABLE_DOC_TYPES` から `LANDING_PAGE` を除外

#### v2(Week 7+)で検討

- Phase 3:静的 HTML エクスポート(Tailwind の使用 class 抽出方式)
- Phase 4:カスタムドメイン
- ブロックの並び替え / 追加 / 削除(DnD)
- 1 プロジェクト複数 LP
- slug 変更時の 301 redirect / 旧 URL 保持
- og:image のテキスト合成(現状は固定画像)
- LP を RAG コーパスに含める(公開 LP を seed 化、ADR-008 の段階的拡張と連動)

#### 監視すべき指標

- LP 公開数 / 全プロジェクト数(機能の利用率)
- 公開 LP へのアクセス時のエラー率(404 / 5xx)
- AI による LP 生成の品質(再生成率)

#### 将来の見直しトリガー

- 1 プロジェクト複数 LP のニーズが顕在化した場合 → `projectId @unique` 制約を外す
- LP の編集自由度(並び替え等)への要望が強い場合 → Phase の優先度を再評価
