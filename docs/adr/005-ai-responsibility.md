# ADR-005: AI 機能の責務分担とコスト戦略

## ステータス

承認済み(2026-05-01)、改訂(2026-05-20、Day 27 RAG_QA 実装に伴う MVP 必須化 + 対話履歴方針追加)

## 背景・問題

Shipyard は AI 機能を主要差別化として位置付ける。Anthropic API を利用して6つの場面で AI を組み込むが、モデル選定・使い分け・コスト管理の方針を確定する必要がある。コスト暴走のリスクと、ユーザー体験の品質確保を両立させる設計を行う。

関連: ADR-001(技術スタック)、ADR-004(課金プラン)

## 検討した選択肢

### モデル戦略

- A. Sonnet 4 一本(高品質統一)
- B. **Sonnet 4 + Haiku 4.5 使い分け**
- C. Haiku 4.5 一本(コスト最優先)

### Tool Use 利用

- A. **構造化出力が必要な場面のみ Tool Use**
- B. 全 AI 呼び出しで Tool Use
- C. JSON モード(プロンプトで指示)のみ

### RAG 実装

- A. **pgvector + 自前パイプライン**
- B. Pinecone マネージド
- C. RAG なし(プロンプトに全文埋め込み)

## 決定

### モデル使い分け

**Sonnet 4** を以下で使用:

- 競合調査(Web Search Tool 併用)
- ドキュメント生成(README、LP、告知文、リリースブログ)
- RAG QA(過去プロジェクト検索による応答)

**Haiku 4.5** を以下で使用:

- タスク分解(構造化のみで品質要件低い)
- リリース前チェックリスト生成
- 簡易な文章推敲

### Tool Use

- 構造化出力が必要な場面のみ Tool Use を使用
- 自然文応答は通常生成
- Tool Use 利用箇所は明示的にコードコメントで理由を記録

### タスク分解と ChecklistItem 親子関係(2 階層厳守)

- AI による分解(`TASK_SPLIT`、Haiku 4.5 + Tool Use)を主経路として位置付ける。生成されたサブタスクは `parentId` で親 ChecklistItem に紐付く
- **手動でのサブタスク作成も許容**: 一覧画面の親直下「+ サブタスクを追加」インラインフォームから create 時に `parentId` を渡す。AI を使わない手動構造化にも対応
- **`parentId` の変更は update 経由では不可**: 編集ダイアログから親変更 / 親解除の UI は提供しない。`parentId` は新規 create(手動 or TASK_SPLIT)と `ON DELETE CASCADE`(親削除 → 子も消滅)でのみ確定する
- **2 階層厳守**: 親 → 子の 2 階層まで。孫禁止(UI 複雑化を避ける + AI Tool スキーマも 2 階層前提)
- API 側ガード(create のみ):親候補が同テナント・同プロジェクトに存在 + 親が parentId=null(=既に子でない、孫禁止)。update から parentId を受け付けないため、自身を親に指定 / 子持ち項目のサブタスク化のケースは構造上発生せず追加ガード不要

### RAG

- pgvector + text-embedding-3-small(1536次元)
- Project ドキュメント、リリース履歴、トラブルログをベクトル化
- HNSW インデックスで近傍検索、上位5件を context に注入

### コスト管理

- AIUsage テーブルでテナント単位の消費量・コストを記録
- Free プラン: 月20回まで(超過時 UI で課金誘導)
- Pro プラン: 無制限(ただし内部上限を月1000回に設定して暴走防止)

## 理由

### Sonnet 4 と Haiku 4.5 の使い分け

- Sonnet 4 は推論品質が必要な場面(競合調査・ドキュメント生成)で力を発揮
- Haiku 4.5 はコスト 1/3 で構造化タスクには十分
- 結果的に総コストを 40% 程度削減できる試算

### pgvector 採用

- ADR-001 で PostgreSQL 採用済み、外部ベクトル DB を増やさない方針
- HNSW インデックスで実用的な検索速度(< 50ms)
- 個人開発者向け規模では十分、Pinecone のコストを回避
- リレーショナルデータと同 DB で結合可能

### Tool Use 限定使用

- Tool Use は安定性が高いが応答時間が増す
- 自然文応答にも Tool Use を強制すると UX 悪化
- 構造化が必要な場面(タスク分解、チェックリスト生成、競合機能比較)に限定

棄却理由:

- **Sonnet 4 一本**: タスク分解のような単純な構造化にも Sonnet を使うとコスト過大
- **Haiku 4.5 一本**: 競合調査やドキュメント生成の品質が下がり、差別化要素が弱まる
- **Pinecone**: マネージド料金が個人開発者向けプランに収まらない
- **RAG なし**: プロンプト長が爆発、トークンコストが膨らむ

## 結果

### 良い影響

- コスト管理が明確、AIUsage テーブルで可視化
- Sonnet/Haiku 使い分けで月1万円程度のコスト試算
- 副業面談で「Anthropic API、Tool Use、pgvector RAG」のフルセット経験を語れる
- 過去プロジェクトの RAG が独自性の核(他のプロジェクト管理 SaaS にない機能)

### 悪い影響・リスク

- Anthropic API 障害時のフォールバック未設計
  - 対策: エラーハンドリングで「再試行を促す」UI、必要なら OpenAI フォールバック追加検討
- Embedding モデル変更時の再ベクトル化コスト
  - 対策: モデル ID をスキーマに保存、移行用スクリプトを別途用意
- プロンプトインジェクションリスク
  - 対策: ユーザー入力は引用符で囲み、システムプロンプトと明確に分離
- 個人情報(プロジェクトのアイデア)が Anthropic に送信される
  - 対策: プライバシーポリシーに明記、Zero Data Retention API 利用を Pro プラン特典として検討

### フォローアップ

- AIUsage 集計ダッシュボード(管理画面)実装
- Anthropic API のレート制限到達時の挙動テスト
- プロンプトテンプレートを `packages/prompts` に集約、バージョン管理
- 将来的にユーザー独自モデル(BYOK: Bring Your Own Key)対応を検討
- AIUsage の月次集計ジョブで予算超過を検知 → Slack 通知

---

## Day 27 改訂(2026-05-20):RAG_QA を MVP 必須化 + 対話履歴方針確定

### 経緯

- Day 22 セッション(2026-05-19)で、ユーザーから「プロジェクトの内容を AI と壁打ちしたいというのがこのシステムのメインの主要用途」 との指摘
- §1 提供価値の筆頭(過去プロジェクトの知見をベクトル検索で再活用)を直接実現する機能でありながら、Day 1〜26 のロードマップに独立 Day として未配置だったことが PROJECT_STATUS.md §9.4「ADR-005 ギャップ」 として明文化された
- 元 ADR(本文 line 41)では「Sonnet 4 を以下で使用 … RAG QA(過去プロジェクト検索による応答)」 と言及されていたが、controller / service / DTO / FE / 対話履歴方針 / コスト試算 の具体仕様が無いまま据え置かれていた
- Day 27〜28 を RAG_QA(BE + FE)に充てる前提で、本改訂で MVP 必須化と対話履歴の永続化方針を確定する

### 検討した対話履歴方針

| 案    | 概要                                           | 採否     | 理由                                                                                                                |
| ----- | ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| A     | stateless(1 ターン完結、履歴持たない)          | 棄却     | 連続質問不可で壁打ち体験が薄く、Shipyard 主要用途を満たさない                                                       |
| B     | FE 保持(`sessionStorage`)+ BE は受信のみ       | 棄却     | スキーマ変更不要で速いが、リロード / デバイス変更で履歴消失、Team プラン監査ログと不整合、prompt cache 最適化が弱い |
| **C** | **DB 永続化(`RagQaSession` + `RagQaMessage`)** | **採用** | 下記「採用理由」参照                                                                                                |

### C 案を採用する理由

1. **§1 提供価値との整合**:「過去プロジェクトの知見をベクトル検索で再活用」 が筆頭価値であり、壁打ちログ自体が将来 RAG ソース化可能(セッションを保存しないと永遠に失われる)
2. **デバイス横断 / セッション切替 / Team プラン監査ログ**:B 案では実現不能
3. **prompt cache 最適化**:Anthropic の `cache_control`(Sonnet 4、5 分 TTL)は BE 一貫で context 構築する C の方が cache hit 率を上げやすい
4. **将来拡張のしやすさ**:「壁打ちログから ProjectDocument に変換」「セッション要約」「タグ付け」 等を後付け可能
5. **コスト試算上、B との差分は無視できる**:DB ストレージは 100 ユーザーで月 50MB ≒ 数十円、prompt cache 効果で API コストはむしろ若干安くなる

### 決定の追加

1. **RAG_QA を MVP 必須化**: 下記エンドポイントを Day 27〜28 で実装する
   - `POST /workspaces/:slug/projects/:id/qa/sessions`(セッション作成)
   - `POST .../qa/sessions/:sid/messages`(質問送信 → 回答受信)
   - `GET .../qa/sessions`(セッション一覧)
   - `GET .../qa/sessions/:sid`(メッセージ履歴取得)
2. **schema 追加**(2 model):
   - `RagQaSession`(id, tenantId, projectId, title, createdBy, createdAt, updatedAt)
   - `RagQaMessage`(id, sessionId, role: `user`|`assistant`, content, tokensIn?, tokensOut?, createdAt)
   - ADR-002 Pool model に準拠(`tenantId` 必須、Cascade 削除)
3. **context 構築**: 直近 N=10 ターンを Anthropic API `messages` として送る(超過時の前段要約は v1.x)
4. **RAG 検索**: `RagSearchService.searchSimilar({ includeSeed: true })` を流用(壁打ち用途で `SEED_PUBLIC` のベストプラクティスも参考になる、ADR-008 と整合)
5. **モデル**: Sonnet 4(元 ADR line 41 で既定)。`cache_control`(Anthropic prompt cache、Sonnet 4 / 5 分 TTL)の付与は **v1.x で追加**(history が 5 ターン超で効果が見え始めるため、MVP 範囲では未実装。下記コスト試算「prompt cache 適用後」 行は v1.x 時点の見込み値)
6. **AIUsage**: `Feature.RAG_QA` で 1 ターンごとに `tokensIn` / `tokensOut` / `cost` 記録
7. **認可**: WRITER_ROLES(OWNER / ADMIN / DEVELOPER)は書込可、READER 系(REVIEWER / TESTER / VIEWER)は履歴閲覧のみ
8. **FE**(Day 28): セッション一覧 + チャット UI + 参照ドキュメント表示(`isSeed` バッジ)

### コスト試算(1 ユーザー / 月)

| 項目                                                     | 値                                                       |
| -------------------------------------------------------- | -------------------------------------------------------- |
| 1 質問あたり入力                                         | ~3-5k tokens(system + RAG context 5 件 + 履歴 10 ターン) |
| 1 質問あたり出力                                         | ~500-1k tokens                                           |
| Sonnet 4 単価                                            | $3 / 1M input, $15 / 1M output                           |
| 1 質問あたりコスト                                       | 約 5〜10 円                                              |
| 想定:月 30 セッション × 平均 8 ターン                    | 240 リクエスト                                           |
| **月コスト(MVP、cache 未適用)**                          | **約 1,700 円 / ユーザー**                               |
| prompt cache hit 想定 50%(履歴部分、v1.x 適用後の見込み) | -30%                                                     |
| **月コスト(v1.x、cache 適用後の見込み)**                 | **約 1,200 円 / ユーザー**                               |

→ Free プラン月 20 回上限(ADR-005 既定)で過剰利用は防げる。Pro / Team の内部上限 1000 回 / 月で十分カバー。

### 入力上限・暴走防止

- 1 メッセージあたり content 最大 8000 文字(DTO で制約)
- 1 セッションあたり 100 メッセージで打ち切り(超過時は新規セッション作成を促す)
- maxTurns = 10(context に積む直近ターン数の上限)

### フォローアップの追加

#### Day 27 で実施(BE)

- `packages/db/prisma/schema.prisma` に `RagQaSession` / `RagQaMessage` 追加 + migration
- `apps/api/src/ai/rag-qa.service.ts` 新規(`createSession` / `appendMessage` / `ask`)
- `apps/api/src/ai/rag-qa.controller.ts` 新規(4 エンドポイント + DTO + 認可ガード)
- E2E:認可マトリクス / 対話履歴反映 / RAG ヒット / テナント越境拒否 / AIUsage 記録

#### Day 28 で実施(FE + 統合)

- `apps/web/src/app/w/[slug]/projects/[id]/qa/page.tsx`(セッション一覧)
- `apps/web/src/app/w/[slug]/projects/[id]/qa/[sessionId]/page.tsx`(チャット UI)
- サイドバー導線追加、isSeed バッジ表示

#### v1.x(Week 7+)で検討

- ストリーミング応答(SSE / WebSocket)
- N > 10 ターン時の前段要約(Haiku 4.5 で要約 → context 圧縮)
- セッション削除ポリシー(無料プラン 30 日 / 有料無期限)
- 壁打ちログを ProjectDocument に変換するボタン(`RagQaSession → ProjectDocument` 抽出)
- セッションのタイトル自動生成(初回質問から Haiku 4.5 で短いタイトル)

#### 監視すべき指標

- 1 セッション平均ターン数(短すぎる場合は UX 改善余地)
- 1 ユーザー / 月の平均トークン消費
- prompt cache hit 率(目標 50% 以上)
- cost per session(目標 50 円以内)
- ユーザーごとの「再質問せず終わる」率(壁打ちが機能しているかの代替指標)
