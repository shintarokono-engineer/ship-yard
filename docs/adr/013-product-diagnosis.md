# ADR-013: PRODUCT_DIAGNOSIS(競合調査 + サービスレベルスコア化)アーキテクチャ

## ステータス

承認済み(2026-05-25)

## 背景・問題

§9.9(2026-05-25)でユーザー方針表明「競合調査機能を追加 + AI でサービスの実用性をスコア化したい」 を受けて、当初 v2 候補だった `Feature.COMPETITOR_RESEARCH` を MVP に取り込み、サービスレベルのスコア化機能と統合する判断が出た。本 ADR ではこの「プロダクト診断(PRODUCT_DIAGNOSIS)」 機能のアーキテクチャを確定する。

### 解決すべき設計課題

1. **競合調査とスコア化の関係**:1 機能に統合するか、2 機能に分離するか
2. **データモデル**:診断結果(スコア + 改善提案 + 競合参照)をどう保存するか、履歴比較をどう実現するか
3. **Feature enum の扱い**:既存の `Feature.COMPETITOR_RESEARCH` と新機能の関係(置換 / 共存 / 統合)
4. **AI 構成**:Claude Sonnet 4 + Web Search Tool + Tool Use の組み合わせをどう設計するか
5. **rubric 設計**:LLM の自己採点バイアスを抑え、再現性のあるスコアを返すための評価軸とその基準
6. **プラン制限**:Pro プランの目玉機能として位置付けつつ、Free でも試せる導線をどう作るか
7. **LLM スコアの限界対策**:主観性・再現性低下・自己採点バイアスへの構造的な防御策

### 既存実装との関係

- `Feature.COMPETITOR_RESEARCH` enum 値は `packages/db/prisma/schema.prisma:123` に既に定義されているが、実装は未着手(`apps/api` 配下に該当 service / controller は無い)
- `LandingPage`(ADR-009)で確立した「専用テーブル + Json ブロック構造 + 1 プロジェクト = 1 LP」 のパターンが履歴を持たないドメインで成功している
- `RagQaMessage.references`(ADR-005 Day 27 改訂)で確立した「参照先が後で編集 / 削除されても履歴的事実を保つために Json スナップショット保存(正規化しない)」 パターンが本機能の `competitorRefs` でも適用できる
- Sonnet 4 + Tool Use(`submit_*` 強制呼び出し)パターンは Day 7(DRAFT_GEN)/ Day 11(CHECKLIST_GEN)/ Day 14(REFINE_DOC)/ Day 15(TASK_SPLIT)/ Day 30(LP 生成)で 5 回確立されており本機能でも踏襲する
- Anthropic の Web Search Tool は本機能で初導入(現状の Shipyard では未使用)

関連:ADR-002(マルチテナント)、ADR-004(課金プラン、ADR-012 で部分改訂)、ADR-005(AI 戦略)、ADR-008(RAG コーパス戦略)、ADR-009(LP ブロック型)、**ADR-012(プラン構造の全面見直し:Free 廃止 + 7 日 Pro トライアル + Pro ¥1,480 + AI クレジット制)**、§9.8(プラン構造、ADR-012 で確定)、§9.9(本機能の起票)

## 検討した選択肢

競合調査機能とサービスレベルスコア化機能の関係について 3 案を検討した。

### A. 統合 `PRODUCT_DIAGNOSIS` 機能

- 概要:1 つの「診断」 機能内で競合調査 → スコア化 → 改善提案を一気通貫で実行。Sonnet 4 が Web Search Tool で類似プロダクトを取得 → 取得した競合データを含めた評価コンテキストで Tool Use(`submit_service_score`)を強制実行 → スコア + 改善提案を構造化出力
- 長所:
  - **UI / API がシンプル**:ユーザーは「診断」 ボタン 1 つで結果を得られる(2 ステップ強要なし)
  - **AI 文脈構築コストが 1 回**:競合データとプロダクトデータを同じ session で扱うため、コンテキストの再構築不要
  - **競合データが評価の根拠になる**:「競合優位性」 軸の評価が事実ベースになる(LLM の知識ベースだけでは古い / 不正確になりがち)
  - **改善提案が具体的**:競合の機能・訴求を踏まえた改善提案が出せる(例:「競合 X は Stripe Customer Portal を採用しているが、本プロダクトの billing UI は内製で UX が劣る」)
  - **AIUsage が 1 件**:課金カウントが明確
- 短所:
  - 1 回のリクエストで Web Search + Tool Use の両方を回すため、レスポンスタイムが長い(目安 30〜60 秒)
  - Web Search が失敗 / レート制限に当たると診断全体が失敗する(部分実行できない)
  - Sonnet 4 + Web Search + 大きなプロンプトでコストが高め(1 回 5〜15 円想定)

### B. 競合調査とスコア化を分離(順序関係あり)

- 概要:`COMPETITOR_RESEARCH` 機能と `PRODUCT_DIAGNOSIS` 機能を別ボタンとして提供。ユーザーが先に競合調査を実行 → 結果を保存 → 後でスコア化を実行(競合データを使う)
- 長所:
  - 競合調査だけ欲しいユーザーが使える
  - 段階的に結果を確認できる(競合調査結果が想定外なら止められる)
  - Web Search 失敗時にスコア化だけは実行できる
- 短所:
  - **ユーザーが 2 ステップを強要される**:UX が冗長
  - 競合調査結果とスコア化の整合性管理(競合データの鮮度 / 関連性)を UI で出す必要がある
  - 2 つの機能を別々に設計・実装するため工数増(MVP +1 Day 見込み)
  - AI コール 2 回でコストが余計にかかる(同じ文脈の再構築)
  - 「競合調査だけ」 単体機能としての価値が薄い(Shipyard はプロダクトを作るユーザー向けで、競合調査は手段であって目的ではない)

### C. 完全分離(スコア化は競合データ不要)

- 概要:`PRODUCT_DIAGNOSIS` は Shipyard 内部データ(ProjectDocument / ChecklistItem / LandingPage)のみで動く。`COMPETITOR_RESEARCH` は独立機能として残す(v2 候補のまま)
- 長所:
  - スコープが最小、Web Search Tool 統合コストがゼロ
  - レスポンスが速い(Sonnet 4 のみ、目安 10〜20 秒)
  - Web Search のレート制限 / コストの懸念なし
- 短所:
  - **「競合優位性」 軸の評価が空想ベース**:LLM の事前学習知識(古い / 誤り含む)頼みになり、スコアとしての信頼性が低い
  - 改善提案が「一般論」 に偏る(競合との具体的比較ができない)
  - Shipyard の差別化価値が弱まる(「AI で診断」 は他社 SaaS でもあるが、「Web Search で実競合と比較して診断」 は差別化要素)

## 決定

**A 案を採用する**:`PRODUCT_DIAGNOSIS` を 1 つの統合機能として実装し、競合調査(Web Search Tool)とスコア化(Tool Use)を 1 リクエスト内で完結させる。

### データモデル

LP と同じく「専用テーブル + Json で構造化データ保存」 パターン(ADR-009 B 案の踏襲)。ただし `LandingPage` と違い 1 プロジェクトに**複数件**の診断結果を持てるようにする(履歴比較が機能の本質)。

```prisma
/// プロダクト診断(PRODUCT_DIAGNOSIS)の結果(ADR-013)。
/// 1 プロジェクトに複数件の診断履歴を持ち、`createdAt` で時系列比較できる。
/// 競合データと AI 採点の理由は Json で snapshot 保存(参照先が後で変わっても履歴的事実を保つ)。
model ServiceScore {
  /// 内部 ID(cuid)
  id              String   @id @default(cuid())
  /// 所属テナント ID(マルチテナント分離キー、必須)
  tenantId        String
  /// 所属プロジェクト ID
  projectId       String
  /// 総合スコア(0-100、breakdown の 5 軸合計 = totalScore で整合性を保つ)。
  /// アプリ層で Tool Use 応答パース直後に `totalScore === Object.values(breakdown).reduce((s, b) => s + b.score, 0)` を
  /// アサートし、不一致は `AIBadResponseError`(502)を投げて DB 保存しない(LLM が合計ミスする可能性への防御)。
  totalScore      Int
  /// 5 軸ブレークダウン(differentiation / targetClarity / featureCompleteness / releaseReadiness / competitiveAdvantage、各 0-20 + コメント)
  breakdown       Json
  /// 改善提案 3〜5 件(priority / title / body / axis)
  suggestions     Json
  /// 競合プロダクトのスナップショット(name / url / summary / similarityNote)。
  /// Web Search 失敗時 / Free プランで Web Search 無効化時は空配列を保存。
  competitorRefs  Json
  /// Web Search Tool を使ったか(Free プランや Web Search 失敗時 false)。
  /// 「Web Search を使わなかった診断」 が UI で明示できるようにフラグ化
  webSearchUsed   Boolean
  /// 使用したモデル ID(AIUsage.model と一致、ai.constants.ts の AI_MODEL_SONNET の値)
  modelUsed       String
  /// 診断実行者 User ID
  createdById     String
  /// 診断実行日時(履歴順、最新が表示の主軸)
  createdAt       DateTime @default(now())

  tenant    Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdBy User    @relation(fields: [createdById], references: [id])

  @@index([tenantId])
  /// 履歴比較画面で「最新 N 件を新しい順」 を高速取得するため
  @@index([projectId, createdAt])
}
```

`User` model に `serviceScores ServiceScore[]`、`Tenant` model に `serviceScores ServiceScore[]`、`Project` model に `serviceScores ServiceScore[]` のリレーション逆引きを追加。

### Json スキーマ(TypeScript で型定義 + Tool Use input_schema で強制)

ブロック型 LP(ADR-009)と同じく、TypeScript 型を単一の真実の源として `apps/api/src/product-diagnosis/` 配下に集約する。

```typescript
// 5 軸の rubric 定義(diagnosis.constants.ts)
export const DIAGNOSIS_AXES = [
  'differentiation',
  'targetClarity',
  'featureCompleteness',
  'releaseReadiness',
  'competitiveAdvantage',
] as const;
export type DiagnosisAxis = (typeof DIAGNOSIS_AXES)[number];

// breakdown(全 5 軸を網羅、Record で型強制)
export type ScoreBreakdown = Record<DiagnosisAxis, { score: number; comment: string }>;
// 例: { differentiation: { score: 14, comment: "..." }, ... }

// suggestions(3〜5 件、優先度付き、どの軸を改善するか紐付け)
export type Suggestion = {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string; // 1 行(60 文字以内推奨)
  body: string; // 詳細(Markdown 可、500 文字以内推奨)
  axis: DiagnosisAxis; // どの軸を改善するか
};

// competitorRefs(0〜5 件、Web Search で取得した実競合のスナップショット)
export type CompetitorRef = {
  name: string; // プロダクト名
  url: string; // 公式 URL(safeHref で `javascript:` 等を無害化、ADR-009 と同パターン)
  summary: string; // Web Search で取得した概要(300 文字以内に切り詰め)
  similarityNote: string; // 本プロダクトとの類似性メモ(Sonnet が生成、200 文字以内)
};
```

### rubric(5 軸 × 各 0-20 点 = 総合 100 点)

各軸の評価基準を system prompt に明示する。これにより Sonnet 4 が一貫した基準で採点でき、ユーザーへの説明責任も果たせる。

| 軸                                   | 重み | 評価基準(概要、詳細は system prompt に記述)                                                                                         |
| ------------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **differentiation**(差別化)          | 20   | 競合と明確に異なる特徴があるか。ターゲット / 機能 / 価格 / 体験のいずれかで「これでなければならない理由」 が言語化されているか      |
| **targetClarity**(ターゲット明確性)  | 20   | 想定ユーザーが README / LP で具体的に言語化されているか(「個人開発者向け」 だけでなく規模 / 目的 / 課題まで)                        |
| **featureCompleteness**(機能完成度)  | 20   | コア機能の網羅性 + ChecklistItem の完了率(DONE / 全体)。リリース後すぐ使える状態か                                                  |
| **releaseReadiness**(リリース準備度) | 20   | 法務(利用規約 / プライバシーポリシー)/ 課金 / ドキュメント / オンボーディングが揃っているか。LP の `publishedAt` 有無もシグナル     |
| **competitiveAdvantage**(競合優位性) | 20   | 実競合(Web Search 取得)と比較して優位な領域があるか。Web Search が無効な場合は LLM の事前学習知識に基づく評価(精度低下を UI で明示) |

各軸の system prompt で `temperature=0.2` 設定 + 「**高得点を安易に付けず、根拠を明示せよ。15 点以上は明確な強みがある場合のみ。**」 を強調する。

### AI 構成

| 要素            | 採用値                                                                                                                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| モデル          | `AI_MODEL_SONNET`(ai.constants.ts、`claude-sonnet-4-6`)                                                                                                                                                                                                                 |
| Web Search Tool | Anthropic 提供の server-side Web Search Tool を有効化(Free プランは無効化)。正式な `type` 名・バージョン文字列は Day 43 実装着手時に Anthropic 公式ドキュメントで確認し、`ai.constants.ts` の定数として集約する(本機能で初導入のため shipyard 既存コードに参照箇所なし) |
| Tool Use        | `submit_service_score` ツールを `tool_choice: { type: 'tool', name: 'submit_service_score' }` で強制呼び出し                                                                                                                                                            |
| temperature     | 0.2(再現性重視、デフォルトの 1.0 だとスコアのブレが ±10 点になり得る)                                                                                                                                                                                                   |
| max_tokens      | 4096(競合 5 件 + 5 軸 + 5 提案 + コメントで約 2000-3000 トークン、余裕含め 4096)                                                                                                                                                                                        |
| 失敗時          | `AIBadResponseError`(502)で透過、`competitorRefs` 空・`webSearchUsed=false` でフォールバック動作はしない(原則として診断は「Web Search あり」 を期待値とする)                                                                                                            |

### `Feature` enum の扱い

新規 `Feature.PRODUCT_DIAGNOSIS` を追加する。既存の `Feature.COMPETITOR_RESEARCH` は schema から**残置するが deprecated 扱い**にする(実装は無いため使われない)。

| 案                                                         | 採否      | 理由                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 新規 `PRODUCT_DIAGNOSIS` 追加 + `COMPETITOR_RESEARCH` 残置 | ✅ 採用   | enum 値削除は PostgreSQL で煩雑(`ALTER TYPE` で値削除は不可、新 enum 作成 → カラム変更 → 旧 enum DROP の手順が必要)。`COMPETITOR_RESEARCH` は未使用なので残しても影響なし。schema コメントで「ADR-013 で PRODUCT_DIAGNOSIS に統合済、新規実装では使わない」 を明記 |
| `COMPETITOR_RESEARCH` をリネーム                           | ❌ 不採用 | データはないが migration の複雑さが ADR-013 のスコープ外。意味的にも「競合調査」 と「プロダクト診断」 は概念が異なる(診断は競合調査を内包する上位概念)                                                                                                             |
| `COMPETITOR_RESEARCH` 削除                                 | ❌ 不採用 | PostgreSQL enum 値削除は実質テーブル再構築が必要(ALTER TYPE DROP VALUE 非サポート)。リスクに見合わない                                                                                                                                                             |

migration:`ALTER TYPE "Feature" ADD VALUE 'PRODUCT_DIAGNOSIS';` の単独 migration(`ALTER TYPE ... ADD VALUE` はトランザクション禁止のため別 migration、Day 14 REFINE_DOC 追加時と同パターン)。

### プラン制限(ADR-004 + ADR-012 改訂版 + §9.8 + §9.9 を踏まえる)

ADR-012(プラン構造の全面見直し)により「ずっと無料の Free」 は新規登録から廃止され、新規テナントは 7 日間 Pro トライアルから始まる。本機能の制限はその新プラン構造に合わせる。

| プラン                                                     | PRODUCT_DIAGNOSIS の実行可否      | Web Search Tool | AI クレジット消費(v1.0.1〜)                    |
| ---------------------------------------------------------- | --------------------------------- | --------------- | ---------------------------------------------- |
| **トライアル(7 日間)**                                     | ✅ 実行可能(Pro 同等)             | 有効            | Pro 同等の 300 cr/月から 3 cr/回(Sonnet 4)消費 |
| **Pro(¥1,480)**                                            | ✅ 実行可能                       | 有効            | 300 cr/月から 3 cr/回(Sonnet 4)消費            |
| **Team(¥2,800/人)**                                        | ✅ 実行可能                       | 有効            | seat × 800 cr 共有プールから 3 cr/回 消費      |
| **Free フォールバック**(解約後 / トライアル終了後の未転換) | ❌ 実行不可(AI 機能停止、ADR-012) | -               | -                                              |

**MVP では数量制限のみ**(ADR-012 §段階的実装):AI クレジット制の正式実装は v1.0.1。MVP では `AIUsageService` の現状ロジック(Pro 300・Team seat×800 の単純数量チェック)に PRODUCT_DIAGNOSIS の暴走防止枠を追加するだけにとどめる。

実装(MVP):

- `ai.constants.ts` に `PRODUCT_DIAGNOSIS_MAX_PER_MONTH_PRO = 50` 等の暴走防止上限を追加(本機能 1 回 5-15 円 × 50 ≒ 月 750 円が Pro ARPU の現実的天井)
- `AIUsageService.assertWithinDiagnosisQuota({ tenantId, plan })` で「Free フォールバック = 403」「トライアル / Pro / Team = 月次上限内チェック」 を行う専用ヘルパーを追加
- v1.0.1 で `AIUsage.credits` カラム追加 + Sonnet 4 = 3 cr / Haiku = 1 cr の重み付けに移行(ADR-012 §段階的実装と同期)

### API 設計

| エンドポイント                                            | 説明                                                                            | 認可                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| `POST /workspaces/:slug/projects/:projectId/diagnoses`    | 新規診断実行(Sonnet 4 + Web Search + Tool Use 呼び出し → `ServiceScore` INSERT) | `WRITER_ROLES`(OWNER / ADMIN / DEVELOPER) |
| `GET /workspaces/:slug/projects/:projectId/diagnoses`     | 診断履歴一覧(`createdAt` 降順、最新 N 件、ページング v1.x)                      | 全テナントメンバー                        |
| `GET /workspaces/:slug/projects/:projectId/diagnoses/:id` | 特定の診断結果詳細(breakdown / suggestions / competitorRefs の全文)             | 全テナントメンバー                        |

DELETE は MVP では実装しない(履歴を消されるとトレンドが分断されるため、削除ニーズが顕在化したら v1.x で実装)。

### UI 配置

- プロジェクト詳細(`/w/{slug}/projects/{projectId}`)の Card グリッドに「プロダクト診断」 Card を追加(`AI 壁打ち` / `ランディングページ` と並ぶ)
- `/w/{slug}/projects/{projectId}/diagnoses` ページ:診断履歴一覧(最新の totalScore を大きく表示 + 履歴のミニグラフ + 「新規診断」 ボタン)
- `/w/{slug}/projects/{projectId}/diagnoses/{id}` ページ:特定診断の詳細(totalScore + 5 軸ブレークダウン(レーダーチャート風 or 棒グラフ)+ 改善提案カード + 競合参照リスト)
- Free プランでは「Web Search を使わない簡易診断」 + 「Pro にアップグレードして本格診断」 CTA を併置

改善提案カードには「ChecklistItem に追加」 ボタンを置く(v1.x、suggestion を ChecklistItem としてプロジェクトに追加する導線)。MVP では UI のみ表示で、変換ボタンは v1.x。

### LLM スコアの限界対策

LLM ベースの採点は構造的に主観性と再現性低下を内包する。以下の 5 つの対策で実用に耐えるレベルに引き上げる。

| 対策                          | 内容                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **rubric の明示**             | 5 軸 × 各 20 点満点 + 各軸の評価基準を system prompt に詳細記述。「総合 100 点満点」 という直感的な指標で説明責任を果たす       |
| **temperature=0.2**           | デフォルト 1.0 だとスコアのブレが ±10 点。0.2 で ±3 程度に収束する見込み(MVP 後に実測で再調整)                                  |
| **「厳しく採点せよ」 prompt** | LLM の自己採点バイアス(高得点を付けがち)対策。「15 点以上は明確な強みがある場合のみ」「根拠を明示せよ」 を system prompt に明記 |
| **UI 上の目安注記**           | スコアの絶対値ではなく「目安」 と明示。「絶対値より相対変化を重視してください」 のヘルプテキストを履歴画面に常設                |
| **相対変化の重視**            | 履歴比較画面で「前回比 +5」 等の差分を全面に出す。絶対スコアは大きく表示するが、「目安です」 注記を併置                         |

## 理由

### A 案を採用する根拠

- **ユーザー体験の明快さ**:「診断」 1 ボタンで結果が出る。プロダクト診断は手段ではなく目的(「自分のプロダクトの実用性が知りたい」)なので、2 ステップの分離は UX 上のノイズになる
- **Shipyard の差別化価値**:Web Search 込みの実競合比較が他社 AI アシスタント(Cursor / Cline / Continue 等)との差別化要素になる。「AI で診断」 は普及しているが「実競合と Web 比較して診断」 は新しい価値
- **競合データが評価の根拠になる**:5 軸の中で「competitiveAdvantage(競合優位性)」 軸の評価が事実ベースになる。LLM の事前学習知識だけだと「2024 年時点の競合」 にしかならない
- **改善提案の具体性**:競合の実機能を踏まえた提案ができる。「これがあれば差別化できる」 ではなく「競合 X はこれを採用しているが本プロダクトは無い」 という比較ベース
- **AI コストの効率**:1 リクエストで Web Search + Tool Use の両方を回す方が、2 リクエストに分けるよりトータルコストが安い(コンテキスト再構築コストの分)

### B 案・C 案を棄却する理由

- **B**:競合調査単体機能の需要が低い(Shipyard ユーザーは「プロダクトを作る個人開発者・小規模チーム」 で、競合調査は副次目的)。UX が冗長で MVP の差別化価値が弱まる
- **C**:「競合優位性」 軸が空想ベースになりスコアの信頼性が下がる。Shipyard の差別化要素が「単なる AI スコア化」 に矮小化される

### Pro/Team 限定(+ トライアル中も実行可能)にする根拠(ADR-012 / §9.8 / §9.9 を踏まえる)

- **Pro プランの目玉機能化**:ADR-012 で Pro プランは ¥1,480 + AI クレジット 300 cr/月という具体価値で再構築済。PRODUCT_DIAGNOSIS を「Pro/Team で実行可能」 と位置付けることで、ADR-012 の Pro 値上げを正当化する目玉機能になる
- **トライアル体験の鍵**:ADR-012 の 7 日間 Pro トライアルでこそ実行できる体験として位置付ける。トライアル中に「自分のプロダクトのスコアが見える」 体験を作れば、Pro 転換動機(ADR-012 目標 10%)に直接寄与
- **コスト保護**:1 回 5〜15 円の Sonnet 4 + Web Search Tool は無制限実行されると ARPU を圧迫する。AI クレジット制(v1.0.1)で 3 cr/回 として Pro 300 cr/月 = 月最大 100 回までという構造的制限を作れる(MVP では暫定的な数量上限 50 回/月で代替)
- **Free フォールバックでの実行不可は ADR-012 と整合**:ADR-012 で「トライアル終了 / 解約後の Free フォールバック状態では AI 機能停止」 が確定。PRODUCT_DIAGNOSIS もこの方針に従い、Free フォールバックでは実行不可とすることでアップグレード動機を明確化

## 結果(Consequences)

### 良い影響

- 公開時の Hero / Features に「**実競合と Web 比較して 100 点満点で診断する Pro/Team 限定機能**」 を訴求でき、Shipyard の差別化が立つ(§9.9)
- Zenn 記事(Day 48)のメインテーマを「Sonnet 4 + Web Search Tool + Tool Use で構造化スコア出力を実装する設計判断」 に据えられる(技術ネタとしての強さ)
- ADR-012 の Pro 値上げ(¥980 → ¥1,480)を正当化する目玉機能となり、value proposition が「AI 無制限」 という曖昧な訴求から「診断機能で自分のプロダクトを 100 点満点採点 + 改善提案」 という具体価値へ昇格
- ADR-012 の 7 日 Pro トライアル中に本機能を体験できることで、ADR-012 が目標とする Pro 転換率 10% への直接寄与が期待できる
- 履歴比較で「自分のプロダクトの実用性スコアが時系列で上がっていく」 が見える化され、Shipyard の継続利用動機になる
- 改善提案を ChecklistItem に変換する導線(v1.x)が成立すれば、診断 → 改善 → 再診断のループが Shipyard 内で完結する

### 悪い影響・リスク

- **LLM スコアの主観性**:
  - 対策:rubric 明示 / `temperature=0.2` / 「厳しく採点」 prompt / UI 上の目安注記 / 相対変化の重視(本 ADR の「LLM スコアの限界対策」 節)
- **Web Search Tool のレート制限 / コスト**:
  - 対策:Pro / Team / トライアル中のみ実行可能とし(Free フォールバックは実行不可)、MVP では `PRODUCT_DIAGNOSIS_MAX_PER_MONTH_PRO=50` 等の暴走防止枠で同時実行数を抑制、v1.0.1 で AI クレジット制(3 cr/回)に移行し ADR-012 の 300 cr/月構造で構造的にコントロール
- **レスポンスタイムが長い(30〜60 秒)**:
  - 対策:UI で「30〜60 秒かかります」 を pending メッセージで明示(`useActionState` で受ける、RAG_QA / REFINE_DOC と同パターン)
- **競合検索結果の品質 / 信頼性**:Web Search が古い情報や誤った類似プロダクトを返す可能性
  - 対策:`competitorRefs` の `url` を `safeHref` で無害化(ADR-009 と同パターン)、UI で「Web Search 結果は AI が選定した参考情報です」 を併記、ユーザーがそのリンクをクリックして検証できる導線を残す
- **トライアル終了 / Free フォールバック時の体験断絶**:7 日トライアル中に診断機能を体験した後、未転換ユーザーは AI 機能停止で本機能が使えなくなる(ADR-012 と整合)
  - 対策:ADR-012 のトライアル終了 3 日前メール通知に「診断機能を継続利用するには Pro へ」 の文言を含める。アップグレード CTA は履歴一覧画面の最上部に常設(過去の診断結果は閲覧可能 = 過去の自分の努力が消えない体験を保つ)
- **`Feature.COMPETITOR_RESEARCH` の残置による混乱**:
  - 対策:schema コメントで「ADR-013 で PRODUCT_DIAGNOSIS に統合済、新規実装では使わない」 を明記、`Feature` enum を参照する箇所(`AIUsageService` / `ai.constants.ts`)では `COMPETITOR_RESEARCH` を新規参照しないことをコードレビューで担保

### フォローアップ

#### Day 43-44 で実施(BE 実装、本 ADR の主要部)

- `ServiceScore` model + migration(`add_service_score`)
- `Feature.PRODUCT_DIAGNOSIS` 追加 migration(`alter_feature_add_product_diagnosis`、ALTER TYPE は単独 migration)
- `apps/api/src/product-diagnosis/`:
  - `diagnosis.constants.ts`(`DIAGNOSIS_AXES` / `PRODUCT_DIAGNOSIS_MAX_PER_MONTH_PRO=50`(MVP の暴走防止枠) / `PRODUCT_DIAGNOSIS_MAX_TOKENS=4096` / `PRODUCT_DIAGNOSIS_TEMPERATURE=0.2` / rubric 定数)
  - `diagnosis-types.ts`(`ScoreBreakdown` / `Suggestion` / `CompetitorRef` の TypeScript 型)
  - `diagnosis-schema.ts`(Tool Use の `input_schema`、上記 TypeScript 型と整合)
  - `product-diagnosis.service.ts`(`runDiagnosis(input)`:プロジェクト + 関連データ収集 → Sonnet 4 + Web Search + Tool Use 呼び出し → `ServiceScore` INSERT + AIUsage 記録、`getHistory(projectId)` / `getById(id)`)
  - `product-diagnosis.controller.ts`(3 エンドポイント)
  - DTO(`RunDiagnosisDto`)
- `ai.constants.ts` に `PRODUCT_DIAGNOSIS_MAX_PER_MONTH_PRO=50` 等の定数追加
- `AIUsageService` に `assertWithinDiagnosisQuota({ tenantId, plan })` ヘルパー追加(Free フォールバック = 403、トライアル / Pro / Team = 月次上限内チェック)
- E2E:トライアル中の実行 / Pro 上限到達 / Free フォールバック 403 / Web Search 失敗時の挙動 / 競合 0 件時の挙動 / VIEWER 認可

#### Day 45-46 で実施(FE 実装)

- `lib/api/types.ts` に `ServiceScore` / `ScoreBreakdown` / `Suggestion` / `CompetitorRef` 型追加、`workspaces.ts` に API 関数 3 件
- プロジェクト詳細に「プロダクト診断」 Card 追加
- 履歴一覧 `/diagnoses`(履歴ミニグラフ + 最新サマリ + 新規診断ダイアログ)
- 詳細 `/diagnoses/{id}`(レーダーチャート / 棒グラフ + 改善提案カード + 競合参照)
- Free フォールバック状態は実行ボタン無効 + アップグレード CTA、トライアル中は残日数バッジ + 「Pro へ転換」 CTA を併置
- セルフレビュー(`/reviewing-own-changes`、セキュリティ重点で Web Search 由来 URL の `safeHref` 確認)

#### v1.x(公開後)で検討

- 改善提案 → ChecklistItem 変換ボタン(suggestion を選択 → 関連カテゴリの ChecklistItem として INSERT)
- 履歴の削除 API(ニーズ顕在化後)
- 診断結果の PDF / Markdown エクスポート
- 競合参照のキャッシュ(同じ Project で連続診断時に Web Search を再利用)
- レーダーチャートライブラリの本格採用(MVP は CSS で簡易表現)
- `temperature` / rubric の精度実測 + 調整(ユーザーフィードバックを集めて再調整)
- セッション内の対話的診断改善(「この提案を実行したらスコアはどう変わる?」 を RAG_QA と連携)

#### v2(Week 10+)で検討

- 競合との比較画面(本プロダクトと競合 N 件の機能対比表を AI が自動生成)
- ベンチマークデータの蓄積(同ジャンルプロダクトの平均スコアと比較)
- スコア改善コーチング(月次レポートで「先月から伸びた軸 / 落ちた軸」 を分析)

#### 監視すべき指標

- 診断実行数 / 全プロジェクト数(機能の利用率)
- トライアル → Pro 転換 / Pro → Team 転換時の「診断機能」 を理由とする割合(ADR-012 の Pro 転換率 10% 目標への寄与度検証)
- 1 回あたりの平均 AI コスト(円)/ Web Search 成功率
- 同一プロジェクトの連続診断でのスコアブレ幅(`temperature=0.2` の妥当性検証)
- ユーザーフィードバック「スコアが妥当か / 改善提案が役に立ったか」

#### 将来の見直しトリガー

- LLM スコアの精度に関する不満が複数寄せられた場合 → rubric の見直し or temperature 再調整
- Pro/Team の月次上限到達ユーザーが大量発生 → ADR-012 の AI クレジット制(v1.0.1)に前倒し移行 + Pro クレジット枠の見直し
- Web Search Tool のコストが想定を大幅超過 → Pro/Team でも月次上限(`PRODUCT_DIAGNOSIS_MAX_PER_MONTH_PRO`)の引き下げ or 追加クレジット購入(ADR-012 v1.x)の前倒し
- Anthropic が新しい Web Search Tool(検索エンジン指定 / 言語フィルタ等)をリリース → 採用検討
