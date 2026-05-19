# ADR-008: RAG コーパス戦略(seed テナント + 段階的拡張)

## ステータス

承認済み(2026-05-19)、改訂(2026-05-19、Day 26 完了に伴う初期コーパス方針差し替え)

## 背景・問題

ADR-005(AI 戦略)では「過去 `ProjectDocument` を pgvector で意味検索し、Sonnet 4 / Haiku 4.5 の生成に context 注入する」ことを Shipyard の独自性のコアとした。これは「使い込むほどユーザー固有のスタイルに収束する」体験を狙った設計だった。

しかし Day 19 で `POST /workspaces`(テナント作成)を実装した段階で、以下の構造的問題が顕在化した。

### 1 テナントあたりのデータ量が永続的に少ない

| ターゲット | 想定プロジェクト数 / 年 | 1 プロジェクトの Document 数 | 1 テナントの累積 Document 数(1 年後) |
| --- | --- | --- | --- |
| 個人開発者 | 5〜10 件 | README + LP + リリースブログ + 告知文 = 4〜6 種 × version | 30〜60 件 |
| 小規模チーム(2〜10 人) | 10〜30 件 | 同上 | 80〜200 件 |

→ **数十件オーダーで頭打ち**。RAG の質的優位(「似た過去事例から学ぶ」効果)が出るには本来「数百〜数千件」の蓄積が必要で、Shipyard のターゲット規模では構造的に達成不可能。

### 結果として ADR-005 の前提崩壊

- 「使い込むほど自分らしくなる」体験が成立しない
- 新規ユーザー = 永続的にコールドスタート状態 = 「ただの Sonnet 4 生成」と差別化されない
- LP / オンボーディングで RAG を売りにできない

### 解決の方向性

「コーパスをテナント内に閉じる」原則を 緩める か、別の差別化軸に振る、のいずれか。前者を採るなら、何を / どこから / どんな承諾で 引っ張るかを設計する必要がある。

関連:ADR-002(マルチテナント = Pool model)、ADR-005(AI 戦略)、§9.3(RAG コールドスタート対策)

## 検討した選択肢

### A. 完全分離 + 新規テナント作成時のサンプル seed(Day 26 当初案)

- 概要:新規テナント作成時に「サンプル README + LP」を 1〜数件、そのテナント内に投入する
- 長所:法務リスクゼロ、ADR-002 完全準拠、実装が最小
- 短所:**根本的にデータ量不足を解決しない**。数件 seed では「ベストプラクティス集」としての価値は出るが、「使い込むほど自分らしく」 にはならない

### B. オプトイン公開(`ProjectDocument.isPublic` 列 + ユーザー操作)

- 概要:ユーザーが UI で明示的に「このドキュメントを公開する」を選んだものだけ、他テナントの RAG context に乗る
- 長所:データ量が増える可能性(個人開発者が公開を選択すれば)、法的にはユーザー同意済み
- 短所:**MVP 公開(Day 38)までに実装不能**。schema 変更 + UI + 利用規約改訂 + プライバシーポリシー改訂 + プロンプトインジェクション対策強化 が必要。文化が育つかも不明(誰も公開を選ばないとデータ量ゼロ)

### C. クロステナント RAG(全テナントのデータを横断検索)

- 概要:他ユーザーのプライベート ProjectDocument もベクトル検索対象に含める
- 長所:データ量問題が一発で解決、shipyard 独自の「集合知 RAG」を謳える
- 短所:**致命的なセキュリティ・法務リスク**(以下に詳述)→ B2B SaaS では取りえない

#### C 案を取れない理由(詳細)

| リスク | 詳細 |
| --- | --- |
| **データ漏洩** | ProjectDocument には API キー / 内部仕様 / ビジネスロジック / 競合分析 / 顧客名 等が書かれうる。これが他人の AI 生成 context に乗る = 直接漏洩 |
| **AI 経由の間接漏洩** | 完全原文を返さなくても、AI が要約して再生成 → 元コンテンツが推測可能。プロンプトインジェクションで context 露出も可能 |
| **ADR-002 Pool model の根本逸脱** | ESLint `no-raw-sql-without-tenant-filter` ルールで構造的に守ってきた設計思想を破壊 |
| **法務リスク** | GDPR / 個人情報保護法 / 営業秘密保護法 / NDA 抵触 |
| **B2B 採用阻害** | 「うちの社内資料が他社の AI 生成に使われる」と知った企業は契約しない |
| **業界標準との乖離** | Notion AI / Slack AI / Linear / GitHub Copilot Chat いずれもクロステナント参照なし(B2B SaaS のデファクト) |

### D. 運営キュレーション コーパス(`SEED_PUBLIC` テナント + 段階的拡張)

- 概要:特別な「seed テナント」(`tenantId='SEED_PUBLIC'` 等)を 1 つ作り、運営が選定したオープンライセンス(MIT / Apache / CC0 等)の README / LP / 告知文を投入する。全テナントの RAG 検索は「自テナント + seed テナント」 を OR で対象にする
- 長所:
  - 法務リスクゼロ(オープンライセンスのみ採用、許諾済み)
  - 「ユーザーのプライベートデータは決して使わない」原則を保ったまま、コーパス量を確保
  - ADR-002 との整合性:「特定の seed テナントは明示的にクロステナント参照可」と例外を ADR で文書化、ESLint ルールに例外を入れる
  - **MVP に収まる**:最初は数件で始めて、段階的にキュレーションを増やせる
  - 将来 オプトイン公開(B 案)を追加するときも、同じ仕組み(`isPublic=true` の document を含む where 拡張)で対応可能
- 短所:
  - 運営側のキュレーション運用コストが恒常的に発生(初期は手動で月次更新、将来は半自動化)
  - 初期コンテンツ準備の時間(Day 26 のスコープ内では 5〜10 件)

### E. RAG をやめて別の独自性軸に振る

- 概要:「過去 ProjectDocument RAG」を独自性から外し、別の軸(テンプレート集 + AI コーチング、競合調査 RAG 等)に振り直す
- 長所:データ量問題から完全に解放される
- 短所:ADR-005 全面改訂が必要、Day 7〜15 で積み上げた RAG 実装(`EmbeddingService` / `RagSearchService` / DRAFT_GEN / CHECKLIST_GEN / REFINE_DOC への context 注入)が無駄になる、Week 3 中盤での方針転換は時間的に厳しい

## 決定

**D 案を採用する**:`SEED_PUBLIC` という特別な seed テナントを 1 つ用意し、運営がキュレーションした README / LP を投入する。すべてのテナントの RAG 検索は「自テナント + `SEED_PUBLIC`」を OR で対象にする。

段階的にコーパスを拡張する:

| 時期 | コーパスソース | 規模目標 |
| --- | --- | --- |
| **Day 26(MVP)** | OSS リポジトリの README(MIT / Apache 限定、frontmatter で attribution)を 6 件投入 | 6 件 |
| **Week 7+ v1.x** | OSS README キュレーションを 50〜100 件に拡張 + LP 用ソース検討 | 〜100 件 |
| **Week 10+ v2** | オプトイン公開(B 案)を追加、`isPublic=true` のユーザー document も同経路で参照可 | 〜1,000+ 件 |

**Day 26 改訂の理由(2026-05-19)**:当初は「運営自作のサンプル README / LP 5〜10 件」を想定していたが、E2E でテンプレート(`(プロジェクト名)` 等のプレースホルダ主体)を seed として投入したところ、生成された README にもプレースホルダが伝染することが判明。RAG が参照すべきは「形式」ではなく「実コンテンツ」であるため、v1.x で予定していた OSS README キュレーションを Day 26 に前倒しした(著名 6 OSS: Hono / Zod / Drizzle / Astro / tRPC / Trigger.dev)。LP の seed については OSS 由来の適切なソースが存在しないため Day 26 では除外し、Week 7+ で別途検討する。

ADR-005 の RAG 部分は本 ADR で補強される(完全に置換するわけではない、コーパス戦略を追加する形)。

## 理由

### D 案を採用する根拠

- **コーパス量問題の本質的解決**:テナント内データだけでは数十件で頭打ちになるという構造問題を、運営が用意する許諾済みコーパスで補う
- **B2B SaaS としての信頼性を維持**:ユーザーのプライベートデータは決して横断しない。「公開」されたコンテンツのみ横断、というルールを明示
- **段階的拡張が可能**:初期 5〜10 件で始めて、運営の運用コストを見ながらキュレーションを増やせる。失敗しても引き返せる
- **将来のオプトイン公開と互換**:同じ「seed テナント方式」のメンタルモデルで、ユーザー公開コンテンツも扱える
- **ADR-002 との整合性を ADR で例外明文化**:「Pool model 原則 + 明示的に許可された seed テナントは例外」 と明記、ESLint ルールにも対応を入れる

### B 案を MVP に含めない理由

- 利用規約 / プライバシーポリシー改訂が必要 → 法務レビュー期間が読めない
- 文化が育つか不明 → 誰も公開を選ばないリスク
- UI 実装コストが大きい → Week 3 残スコープに収まらない
- 公開後 v2 で追加できる(D 案の seed テナント仕組みをそのまま流用)

### C 案を棄却する理由

- 上記「C 案を取れない理由」表の通り、致命的なセキュリティ・法務リスク
- 業界標準(Notion / Slack / Linear / GitHub Copilot Chat いずれもクロステナント参照なし)からの乖離

### E 案を棄却する理由

- ADR-005 全面改訂 + 既存実装(Day 7〜15)の大幅手戻り → Week 3 中盤の時間的に不可能
- 「過去ドキュメント RAG」自体は良い独自性軸なので、コーパス戦略の補強で救える(本 ADR の結論)

## 結果(Consequences)

### 良い影響

- **新規ユーザーが初回から RAG の恩恵を受けられる**:`SEED_PUBLIC` のドキュメントが context に乗るため、テナント作成直後でも「ベストプラクティスを参照した」生成が体験できる
- **「使い込むほど自分らしくなる」のメッセージングが救われる**:自テナント蓄積分が段々と context に乗る比率が上がっていく(seed と自分のドキュメントが混ざる)
- **B2B 採用障壁が下がる**:ユーザーのプライベートデータが他テナントに漏れない設計が明文化されているため、企業契約時の説明資料として使える
- **段階的拡張による低リスク運用**:初期コーパスが少なくても、運営のキュレーション速度に合わせて増やせる
- **オプトイン公開(v2)への移行コストが小さい**:同じ仕組みの拡張で済む

### 悪い影響・リスク

- **運営側のキュレーション運用コスト発生**:
  - 対策:初期(Day 26〜v1.x)は月次手動更新、対象は OSS の README(MIT / Apache / CC0)に限定して license 確認コストを最小化
  - 監視指標:キュレーション件数 / 月、RAG ヒット率(seed vs 自テナント)
- **`SEED_PUBLIC` のコンテンツ品質がそのまま AI 生成品質に影響**:
  - 対策:キュレーション基準を明文化(GitHub Stars > 100 / 直近 1 年更新あり / README が 50 行以上 等)
- **ADR-002 の Pool model 原則に例外を作る**:
  - 対策:本 ADR で例外を明文化(`SEED_PUBLIC` テナントは「ベクトル検索のみ」横断可、それ以外の業務テーブル(Project / ChecklistItem / 等)は従来通り完全分離)
  - ESLint カスタムルール `no-raw-sql-without-tenant-filter` を更新:「`WHERE tenantId IN (...)` で複数 tenantId を許容、ただし `SEED_PUBLIC` 等の許可リストに限る」 等の対応
- **`SEED_PUBLIC` の embedding 生成コスト**:キュレーション件数 × text-embedding-3-small ($0.020 / 1M tokens)、現実的にはほぼ無視できる(1000 件投入で数 USD)

### フォローアップ

#### Day 26 で実施(完了 2026-05-19)

- ✅ `SEED_PUBLIC` テナント + System User + `prj_seed_templates` プロジェクトを migration(`20260519160000_add_seed_public_tenant`)で作成
- ✅ `apps/api/src/onboarding/seed-corpus/*.md` に OSS README 6 件を配置(Hono / Zod / Drizzle / Astro / tRPC / Trigger.dev、すべて MIT または Apache-2.0)
- ✅ CLI `pnpm --filter @shipyard/api seed-corpus:apply` で seed テナントに ProjectDocument を投入 + embedding 生成
- ✅ `RagSearchService.searchSimilar` を拡張:`includeSeed?: boolean`(default true)、`WHERE "tenantId" IN (${callerTenantId}, ${SEED_PUBLIC_TENANT_ID})` 形式で seed も検索対象に
- ✅ `SEED_PUBLIC_TENANT_ID = 'SEED_PUBLIC'` を `apps/api/src/ai/ai.constants.ts` に定数化
- ✅ `RagSearchHit` に `isSeed: boolean` を追加(`row.tenantId === SEED_PUBLIC_TENANT_ID` で算出)

##### License compliance(Day 26 実装済)

- 各 seed .md ファイルの frontmatter に `source_url` / `license` / `original_author` を必須化(all-or-nothing バリデーション)
- CLI が ProjectDocument 投入時に本文末尾へ自動で attribution ブロックを付与:
  ```
  ---

  > **Source:** {source_url}
  > **License:** {license}
  > **Original Author:** {original_author}
  > Reproduced as part of the Shipyard seed corpus (ADR-008).
  ```
- これにより RAG retrieved context にも attribution が乗り、Sonnet 4 への入力と生成物の双方で出典明示が可能(license 遵守 + 生成物の信頼性向上)

#### v1.x(Week 7+)で実施

- OSS リポジトリの README をキュレーションする運用フロー確立(GitHub API + license 確認)、Day 26 の 6 件を 50〜100 件規模に拡張
- LP 用 seed の調達戦略検討:OSS には classic LP はほぼ存在しないため、(1) OSS の README 冒頭 Hero / Features 節を LP として再利用、(2) Public Sandbox / Demo サイトの利用規約上明示的に許可されたものを選定、のいずれかを検討
- `source_url` / `license` / `original_author` を ProjectDocument schema に列追加するかは、件数が 100 件超えた時点で再検討(現状は frontmatter + 本文 attribution で十分)

#### v2(Week 10+)で検討

- オプトイン公開(`ProjectDocument.isPublic` 列追加 + UI + 利用規約改訂)
- 公開ドキュメントに対する「いいね」「使われた回数」等のフィードバック機能

#### 監視すべき指標

- RAG ヒット率(自テナント / seed テナント の割合)
- 生成品質(ユーザーの「再生成」率、低いほど質が高い)
- `SEED_PUBLIC` の embedding 全件再生成時間(モデル更新時の運用コスト)
- 法務インシデント発生件数(目標:ゼロ)

#### 将来の見直しトリガー

- 1 テナントあたりの累積 ProjectDocument 数が想定を超えた(例:平均 500 件超)場合 → seed への依存を下げる
- オプトイン公開コンテンツが 1,000 件超に達した場合 → `SEED_PUBLIC` のキュレーションコストを下げる(ユーザー公開分にシフト)
- AI モデルの context window 拡張により RAG 自体の重要性が変わった場合 → ADR 全面再評価
