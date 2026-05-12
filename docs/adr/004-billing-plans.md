# ADR-004: 課金プラン構造と Stripe 連携

## ステータス

承認済み(2026-05-01)

## 背景・問題

Shipyard の収益モデルとプラン構造を確定し、Stripe との連携設計を行う必要がある。MVP リリース時から課金可能な状態を目指す。Free プランでユーザー獲得、有料プランで個人開発者・チームを収益化する設計が必要。

関連: ADR-001(技術スタック)、ADR-002(マルチテナント方式)

## 検討した選択肢

### プラン構造

- A. 2プラン(Free / Pro)
- B. **3プラン(Free / Pro / Team)**
- C. 1プラン(Pro のみ、無料トライアル付き)

### Stripe 連携方式

- A. **Stripe Checkout(リダイレクト型)**
- B. Stripe Elements(自前 UI 埋め込み)
- C. Stripe Payment Element(統合型)

### 課金単位

- A. テナント単位定額(Pro 月額固定)
- B. **メンバー単位課金(Team プランのみ人数課金)**
- C. 利用量課金(AI 呼び出し回数に応じて従量制)

## 決定

### プラン構造(月額、税抜)

| プラン | 月額      | ワークスペース | メンバー | AI 月次回数 | 主要機能                       |
| ------ | --------- | -------------- | -------- | ----------- | ------------------------------ |
| Free   | ¥0        | 1個まで        | 3人まで  | 20回        | 基本機能のみ                   |
| Pro    | ¥980      | 無制限         | 無制限   | 無制限      | 高度なAI機能、優先サポート     |
| Team   | ¥2,800/人 | 無制限         | 無制限   | 無制限      | + 共同編集、レビュー、監査ログ |

### 連携方式

- **Stripe Checkout** でリダイレクト型決済
- **Webhook** で課金状態を DB ミラー
- **Subscription Quantity** で Team プランの人数を表現

## 理由

### プラン3段階構造

- Free でユーザー獲得障壁を下げ、初期トラクションを確保
- Pro で個人開発者を収益化(¥980 という心理的閾値)
- Team で小規模チーム導入を獲得(人数課金で大規模化対応)
- 個人と小規模チームをはっきり分けることで価格抵抗を最小化

### Stripe Checkout 選定

- PCI DSS 対応を Stripe に丸投げできる
- 自前 UI(Elements)に比べて実装コスト 1/5
- モバイルレスポンシブが標準対応
- Apple Pay、Google Pay にも自動対応

### 人数課金(Team)

- Subscription Quantity を活用、Stripe 標準機能で実装可能
- メンバー追加時に Quantity を即時更新する設計
- Proration は Stripe デフォルト(`create_prorations`)に委譲

棄却理由:

- **2プラン構造**: チーム導入時の単価設計が困難
- **Stripe Elements**: 3週間 MVP には実装コスト過大
- **利用量課金**: ユーザーが課金額を予測しにくい、サポート負荷が増す

## 結果

### 良い影響

- 3週間スコープで実装可能
- 副業面談で「Stripe Webhook、Idempotency、Subscription Quantity 経験あり」と言える
- 課金フローが標準的、ユーザー学習コストゼロ
- Apple Pay / Google Pay 対応が自動でついてくる

### 悪い影響・リスク

- Stripe 手数料(3.6% + ¥30/件)を吸収する必要がある
- Webhook 障害時の DB 不整合リスク
  - 対策: Idempotency Key + 月次バッチでの整合性確認
- メンバー追加と Quantity 同期のタイミングずれ
  - 対策: Webhook 失敗時の再送、Stripe Dashboard で手動修復可能な設計
- 解約後のデータ保持期間設計が必要
  - 対策: 7日 grace → 30日凍結 → 削除のフロー実装

### フォローアップ

- Webhook イベントテーブルで `stripe_event_id` を一意制約(Day 6)
- 解約後 Grace Period 7日 → 凍結 30日 → 削除のフロー実装
- 失敗 Webhook の再処理機構(BullMQ ベース)
- 将来的に年額プラン(15%割引)を追加可能な Stripe Product 設計
- 法人請求書払い対応(将来要件)
- 消費税対応(課税事業者になる売上に到達したら)

## 補足: `Tenant.plan` と `Subscription.plan` の二重保持(Day 6 実装メモ)

プラン値を `Tenant.plan` と `Subscription.plan` の両方に持たせている。これは**意図的な非正規化**:

- `Subscription.plan` — Stripe を真実の源とするミラー(Webhook で同期)。課金の詳細(`status` / `currentPeriodEnd` / `canceledAt` / Stripe ID 群)もここに持つ。**権威ある値**
- `Tenant.plan` — `Subscription.plan` を**ホットパス用にコピー**したもの。「このワークスペースのプランは?」はプラン制限の判定(Free → AI 月 20 回上限、Team → 監査ログ表示 等)で多用され、`Tenant` はテナント解決のためほぼ毎リクエスト読まれる。`Tenant` 側に `plan` があれば `Subscription` への JOIN を毎回しなくて済む

トレードオフ: 2 値がズレ得る ↔ 認可チェックのたびに JOIN しない。**整合性は Webhook ハンドラ(`BillingService.applyStripeSubscription` / `cancelStripeSubscription`)が常に両方を同時更新することで担保する**。`Subscription` 側が常に権威で、`Tenant.plan` がそれに追従する。ズレが起きた場合は「悪い影響・リスク」の月次バッチで `Subscription.plan` を正として補正する。
