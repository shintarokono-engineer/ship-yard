# ADR-012: プラン構造の全面見直し(Pro 値上げ + Free → トライアル化 + AI クレジット制)

## ステータス

承認済み(2026-05-25)。ADR-004(課金プラン構造と Stripe 連携)を**部分改訂**する。Stripe 連携方式(Checkout)・Subscription Quantity・Webhook Idempotency 等の仕組みは ADR-004 を継続し、本 ADR が改訂するのは「プラン構造」と「AI 使用量モデル」と「無料導線(Free → トライアル)」の 3 点。

## 背景・問題

ADR-004 で定めた現行プラン構造には、2026-05-22(§9.8)以降の精査で次の問題が明らかになった。

### 問題 1:Pro と Team のカニバリゼーション(§9.8)

Pro は「メンバー無制限 + 定額 ¥980」で、複数人チームでも料金固定。Team は人数課金。協業機能(共同編集・レビュー・監査ログ)を妥協できるチームは Pro 定額で済ませることができ、Team が選ばれにくい。

### 問題 2:AI「無制限」の採算破綻

Pro / Team で AI 無制限としていたが、Anthropic API は従量課金で**売上原価が青天井**になる。Pro ¥980 で Sonnet を月 110 回使われると赤字。設計と実コストが整合していなかった。

### 問題 3:Free が「重い」(本 ADR の評価で発見)

Free 1 user あたり AI コスト ~¥150/月(Haiku 20 回)。「ずっと無料」前提の場合、Free が増えるほど赤字が線形に拡大。Free 500 user で月 ¥75,000 のコスト負担となり、転換率 5-15% を達成しても損益分岐に届かない(`docs/infrastructure-cost.md` のフロア月 ¥10,000 と合わせるとシナリオ分析で恒常赤字)。

### 問題 4:Pro と Team の差別化の弱さ(§9.8)

「+ 共同編集、レビュー、監査ログ」だけが Team の差分で、それを必要としないチームは Pro 定額に流れる。境界が明確でない。

関連:ADR-004、PROJECT_STATUS §9.8、`docs/infrastructure-cost.md`、CLAUDE.md(ターゲット定義)、ADR-005(AI 戦略・Sonnet/Haiku 使い分け)

## 検討した選択肢

### A. 現状維持(ADR-004 そのまま)

問題 1-4 がすべて残る。棄却。

### B. §9.8 の推奨案(Free 1 人 / Pro 1 人 / Team 2 人〜、AI 無制限のまま)

問題 1, 4 は解消されるが、問題 2(AI 無制限)と問題 3(Free 負担)が残る。棄却。

### C. Pro 値上げ(¥1,480)

¥980 心理閾値を捨てる代わりに、Pro の粗利を健全化(満額使用で 33%、平均 64%)。問題 2 を一部解消。

### D. Free を「期間制 Pro トライアル」に置換

「ずっと無料の Free」を廃止し、新規登録に Pro トライアルを自動付与。SaaS 主流戦略(GitHub Copilot / Cursor / Linear 等)。問題 3 を根本解決(Free 負担 ¥0)。

### E. AI 無制限 → AI クレジット制

モデル別コストを反映したクレジット制(Haiku=1cr、Sonnet=3cr)で AI 量を plan 単価に整合させる。問題 2 を解消。

### F. C + D + E + 単独/複数人の分離(採用)

上記 C・D・E を組み合わせ、さらに §9.8 の単独/複数人による分離(問題 1, 4 解消)を取り入れる。問題 1-4 をすべて解消し、ユニットエコノミクスが健全化する。

## 決定

**F 案を採用する。**

### 新しいプラン構造

| プラン                   | 月額       | メンバー | AI クレジット/月      | Sonnet 利用 | 主要機能                                                                       |
| ------------------------ | ---------- | -------- | --------------------- | ----------- | ------------------------------------------------------------------------------ |
| **新規登録(トライアル)** | ¥0         | 1 人     | Pro と同等(300 cr)    | ✓           | **7 日間 Pro 全機能**(クレカ登録不要)                                          |
| **Pro**                  | **¥1,480** | 1 人     | 300 cr                | ✓           | + Sonnet 4 利用、複数プロジェクト無制限、優先サポート                          |
| **Team**                 | ¥2,800/人  | 2 人以上 | 800 cr/人(共有プール) | ✓           | + メンバー招待・6 ロール・共同編集・レビュー・監査ログ、**7 日無料トライアル** |

「ずっと無料の Free」は新規登録導線から**廃止**。トライアル終了後に有料化しなかったテナントは AI 機能が停止し、プロジェクトの閲覧のみ可能(`Tenant.plan = FREE` のフォールバック状態。enum 自体はデータ互換性のため残す)。

### AI クレジット仕様

- **Haiku 4.5 = 1 cr / 回**、**Sonnet 4 = 3 cr / 回**(実コスト比)
- 月初リセット(暦月)。Team は seat × 800 cr をワークスペース内で共有プール
- `AIUsage` テーブルで利用追跡(ADR-005 と整合)
- 月内使い切ったら AI 機能が一時停止、翌月リセットで復活
- v1.x で**追加クレジット購入**(100 cr / ¥500)を提供

### 「Team 専用」になる機能(複数人で使うこと自体)

ADR-004 では Team の差分が「共同編集・レビュー・監査ログ」のみだったが、本 ADR では**「複数人で使うこと」全体**が Team 専用になる:

- メンバー招待(`InvitationToken`、`POST /workspaces/:slug/invitations`)
- 6 ロール(`TenantMember.role`)
- 共同編集
- レビューワークフロー
- 監査ログ

Pro / トライアル / Free フォールバック では、ワークスペースは 1 人(オーナー)のみ。招待 UI 等は非表示またはアップグレード誘導に。

### ADR-004 との関係

本 ADR が改訂するのは ADR-004 の「プラン構造の表」と「AI 無制限」の前提のみ。以下は ADR-004 を引き続き踏襲する:

- Stripe Checkout(リダイレクト型決済)
- Subscription Quantity による Team プランの人数表現
- Stripe Webhook + Idempotency Key
- `Tenant.plan` をホットパスにコピーする最適化

## 理由

### F 案を採用する根拠

1. **問題 1〜4 をすべて解消**:カニバリ、AI 無制限の採算破綻、Free 負担、Pro/Team 差別化の弱さ
2. **ユニットエコノミクスが成立**(下記シナリオ分析):月 500 アクティブで損益分岐、月 2,000 で月 +¥92,000 規模
3. **SaaS 主流戦略との整合**:期間制トライアル + 値上げ + クレジット制は AI SaaS(Cursor / GitHub Copilot 等)で実証されたパターン
4. **CLAUDE.md ターゲット定義との整合**:個人開発者 = Pro、小規模チーム = Team が 1 対 1 対応

### Pro ¥1,480 への値上げ根拠

- ADR-004 の ¥980 心理閾値は崩すが、競合(Notion Plus ~¥1,500、Linear Basic ~¥1,200、Asana Starter ¥1,500、Cursor Pro ~¥3,000)のレンジ内
- AI 込みの提供価値で正当化可能。¥980 のまま AI 量を絞ると「使えない Pro」になり Pro 転換しない悪循環
- 満額使用でも粗利 33%(¥980 だと 8%)。事業として持続可能な水準に

### ユニットエコノミクスのシナリオ分析

固定費 = ¥10,000/月(`docs/infrastructure-cost.md`)。

| 段階         | 月アクティブ | Pro | Team(seat) | 売上     | 粗利     | トライアル/Free 負担     | **純利益/月**                 |
| ------------ | ------------ | --- | ---------- | -------- | -------- | ------------------------ | ----------------------------- |
| MVP 直後     | 50           | 2   | 2          | ¥8,560   | ¥4,834   | -¥2,250                  | **-¥7,416**(クレジットで吸収) |
| 初年度終盤   | 500          | 20  | 6          | ¥46,400  | ¥27,610  | -¥11,250(累積トライアル) | **+¥17,610**(黒字)            |
| スケール段階 | 2,000        | 100 | 40         | ¥260,000 | ¥152,500 | -¥45,000                 | **+¥92,500**(安定黒字)        |

転換率はトライアル → Pro が 10%、Pro → Team が 8% という保守的な前提で算出。

### 棄却理由

- A:問題 1-4 がすべて残る
- B:問題 2-3 が残り、スケールしても赤字続行
- C 単独:カニバリと AI 採算は解消されない
- D 単独:Pro 値上げと AI クレジット制が無いと採算は依然弱い
- E 単独:UI / 価格が複雑化するだけでカニバリ問題が残る

## 結果(Consequences)

### 良い影響

- ユニットエコノミクスが健全化(月 500 アクティブで損益分岐、Free 負担の線形拡大が消える)
- カニバリと差別化の弱さが構造的に解消
- 「7 日間全機能を試せる」体験により、Pro の価値を実感してから決済に進める導線が成立
- AI クレジット制で AI コストの透明性が上がり、ユーザーも自分の使用状況を把握しやすい

### 悪い影響・リスク

- **¥980 心理閾値を捨てる**(問題:個人開発者の最初のハードルが上がる):
  - 対策:7 日トライアルで「使ってから決める」体験を提供。トライアル中のリテンション施策が重要
- **「ずっと無料」が消える**(問題:競合に Free 厚い製品があると見劣り):
  - 対策:7 日間は Pro 全機能を試せる、と訴求。トライアル中のオンボーディングを丁寧に
- **トライアル終了で AI 停止**(問題:離脱率上昇の可能性):
  - 対策:トライアル終了 3 日前にメール通知。継続率モニタリング
- **AI クレジット制の実装が新規**(問題:現状はモデル別管理が無い):
  - 対策:段階的実装。MVP では数量制限のみ、クレジット制は v1.0.1 で導入
- **Stripe price ID を変更**(問題:既存 ADR-004 ベースの Stripe 設定):
  - 対策:新 price ID を作成し、新規 subscription から適用。既存(本番ゼロ)は無視可

### 段階的実装計画

Week 6(MVP リリース)に全部入れず、3 段階に分けてリリースする。

#### MVP リリース時(Day 41〜44 → Week 6 再配分後は Day 49 前後)

最小限のスコープに絞り、Week 6 の他のタスク(README / Zenn / 告知)を圧迫しない:

- Stripe で新しい Price を作成(Pro ¥1,480、Team ¥2,800/人)
- Stripe で **7 日トライアル**(`trial_period_days = 7`、payment method なしで OK)を設定
- 新規 signup フロー(`/onboarding`)で Pro トライアル subscription を自動作成
- プラン紹介 UI(`/w/{slug}/settings/billing`)を新プラン表に更新
- AI 数量制限は現状の「Free 20 回上限」ロジックを暫定流用(Pro はサーバ側で 300、Team は seat ×800 の単純チェック)
- **Team seat 整合の write 時同期**(招待承諾・退会で Stripe `subscription.update({ quantity })` を Saga パターンで呼び、失敗時はメンバー操作もロールバック)。`Subscription.quantity` フィールド追加 + `customer.subscription.updated` Webhook で内部ミラー。詳細は下記「Team seat 整合(write 時同期と 3 段防御)」節
- **AI クレジット計算の seat 源を Stripe Quantity に切替**(`apps/api/src/ai/ai-usage.service.ts:getPlanCreditLimit` を現状の `tenantMember.count` から `Subscription.quantity` ミラー由来へ)

#### v1.0.1(公開後 1〜2 週間)

- **AI クレジット制の正式実装**:Haiku=1cr、Sonnet=3cr の重み付け、`AIUsage` に credits フィールド追加、月初リセット処理(cron / 別バッチ)
- **Free フォールバック状態の整備**:トライアル終了 / 解約後の `Tenant.plan = FREE` 時の挙動(AI 停止、UI のアップグレード誘導)
- **メンバー招待の Team 限定化**:Pro / Free では `POST /workspaces/:slug/invitations` を 403、UI 上の招待ボタン非表示
- ADR-004 の Stripe price ID 関連の `.env.example` 等を新プランへ更新

#### v1.x(公開後 1〜3 ヶ月)

- **追加クレジット購入**(100 cr / ¥500)
- **トライアル終了通知メール**(3 日前、当日)
- **Team の請求書発行**(Stripe Invoice ベース、企業契約向け)
- **年額プラン**の追加(Pro 年額 ¥14,800 = 2 ヶ月分割引)
- **Team seat 整合の reconciliation バッチ**(日次で Stripe Quantity と TenantMember.count を突合、ズレ検出 → Slack 通知 + 自動補正)。詳細は下記「Team seat 整合(write 時同期と 3 段防御)」節

### Team seat 整合(write 時同期と 3 段防御)

`docs/implementation-rules.md` §課金で「Team プランの人数は Subscription Quantity で表現、メンバー追加時に即時更新」と要求されているが、Stripe(`Subscription.quantity`)と内部 DB(`TenantMember.count`)は別システムで、両方を 1 トランザクションで commit できない。完全な整合は分散システム的に不可能なので、**3 段防御で「ズレの窓」と「規模」を最小化**する設計を採る。

#### ズレが生む問題

- **`TenantMember.count` > `Subscription.quantity`(課金漏れ方向)**:収益損失。課金外メンバーが Team 機能(招待・6 ロール・共同編集・レビュー・監査ログ)を使用。AI クレジット共有プールが希薄化し paid customer の不満源
- **`TenantMember.count` < `Subscription.quantity`(顧客損方向)**:顧客の払い損、チャーン要因。Pro 制限(300 cr)の実質回避(3 人で 5 seats 分 4,000 cr を独占)

#### ズレが起こる経路(write 同期だけでは塞ぎきれない)

| # | きっかけ | 結果 | 第 1 層で防げるか |
| --- | --- | --- | --- |
| 1 | 招待承諾 | TenantMember 増 | ✅ |
| 2 | メンバー退会・削除 | TenantMember 減 | ✅(同経路で実装する) |
| 3 | 顧客が Stripe Customer Portal で seat 変更 | Stripe Quantity 増減 | ⚠ Webhook 受信後の eventual consistency |
| 4 | Stripe Webhook の遅延・取りこぼし | 内部ミラーが古い | ❌ |
| 5 | 招待承諾の同時実行(race condition)| check-then-act で 1 件超過 | ⚠ advisory lock 等が要る |
| 6 | DB マイグレーション・運用作業で直接 SQL | TenantMember 直接変更 | ❌ |

#### 3 段防御

| 層 | 役割 | 実装タイミング |
| --- | --- | --- |
| **第 1 層(Write 同期)** | 招待承諾・退会で Stripe `subscription.update({ quantity })` を Saga パターンで同期。Stripe 成功 → DB tx commit、Stripe 失敗 → DB tx rollback | MVP リリース時(Day 49 前後)|
| **第 2 層(Read 制限)** | AI クレジット計算を `Subscription.quantity`(Stripe ミラー)由来に切替。ズレが残っても「課金 seat × 800 cr」が上限のため経済的暴走を遮断 | MVP リリース時(同上) |
| **第 3 層(Reconciliation)** | 日次バッチで Stripe Quantity と TenantMember.count を突合、ズレ検出 → Slack 通知 + 自動補正可能なら補正、無理なら運用判断 | v1.x |

#### 具体的な作業内容(MVP リリース時)

- `packages/db/prisma/schema.prisma` の `Subscription` に `quantity Int @default(1)` を追加 + migration
- `apps/api/src/invitations/invitations.service.ts:accept()` で Stripe `subscription.update` を呼び、失敗時はメンバー追加もロールバック
- `apps/api/src/members/members.service.ts:remove()` で同様に -1 同期
- `apps/api/src/billing/billing.webhook.controller.ts` で `customer.subscription.updated` を受信し `Subscription.quantity` をミラー更新
- `apps/api/src/ai/ai-usage.service.ts:getPlanCreditLimit` を `tenantMember.count` から `Subscription.quantity` 由来へ切替

#### F3(v1.0.1)で対応しなかった理由

F3 は ADR-012 のクレジット制実装が本筋で、Stripe 連携の整備は別タスク。本番ユーザー 0 のため MVP リリースまでに実装すれば実害ゼロ。MVP リリース時に Stripe price 新設 + トライアル設定 + Webhook 整備を**どのみち実施するため、その文脈で seat 同期も一緒に実装する方が自然**。

#### 残るリスク(0 にはならない、運用で吸収)

- 第 1 層と第 3 層の間の窓(最大 24 時間)で発生する不整合
- 重大な同時並行操作(複数経路から同時書き換え)
- Stripe 障害中のメンバー操作 → 第 3 層待ち

これらは **「経済的に許容できる範囲」**としてビジネス側で判断する(月 1 件 ¥5,000 の課金漏れ程度なら運用補正で十分、月 100 件規模なら第 1 層実装に欠陥があるので根本修正)。

### フォローアップ

- ADR-004 のステータスに「ADR-012 で部分改訂」を注記
- `docs/infrastructure-cost.md` の損益分岐節を ADR-012 のシナリオに更新
- `apps/api/.env.example` の `STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAM` のコメントを「ADR-012 の新 Price ID」と注記
- `apps/web/src/app/w/[slug]/settings/billing/_components/plan-comparison.tsx` を新プラン表に更新

### 監視すべき指標

- 新規登録 → トライアル開始率(理想 100%)
- トライアル → Pro 転換率(目標 ≥ 10%)
- Pro → Team 転換率(目標 ≥ 8%)
- AI クレジット消費分布(各プランの平均使用率)
- AI 売上原価率(目標 ≤ 50%)
- 月次 ARR / ARPU 推移

### 将来の見直しトリガー

- トライアル転換率が 5% を切る → トライアル期間延長 or オンボーディング改善
- Pro 平均 AI 使用率が 95% を継続 → クレジット上限引き上げ or 値上げ
- Team 中央値人数が 6 人超 → Enterprise プラン検討
- AI 売上原価率が 60% 超 → モデル使い分けの最適化 or 値上げ
