# Spec: F20 トライアル終了通知メール

**作成日**: 2026-08-23
**ステータス**: 設計確定(実装計画は writing-plans で別途)
**関連**: ADR-012(プラン構造、本機能の出典)/ ADR-007(メール基盤)/ ADR-011(軽量 AWS 構成)/ PROJECT_STATUS §9.12.2 F20

## 0. このドキュメントについて

v1.x フォローアップ F20「トライアル終了 通知メール」の実装に直結する詳細設計です。ADR-012 の v1.x 節に「トライアル終了通知メール(3 日前、当日)」とだけ書かれていた項目を、実装可能なレベルまで具体化します。

### 目的

ADR-012 の KPI「**トライアル → Pro 転換率 ≥ 10%**」に直結する穴を塞ぎます。現状、トライアルは `trial_settings.end_behavior.missing_payment_method: 'cancel'` により 7 日後に**予告なく**終了し、`Tenant.plan = FREE` に落ちて AI 機能が停止します。ユーザーは終了を事前に知る手段を持ちません。

### スコープの境界

| 区分         | 範囲                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------- |
| **本 Spec**  | トライアル終了の事前通知 2 通(3 日前 / 当日)+ 日次バッチ実行基盤 + トライアル終了時刻の日境界化   |
| 非スコープ   | トライアル終了**後**のフォローメール(復帰導線)、ウェルカムメール、F15 Reconciliation バッチ本体   |
| 将来の再利用 | 本 Spec で作る `jobs/` モジュールと EventBridge の仕組みは、F15 が rule を 1 つ足すだけで乗れます |

---

## 1. ブレストで確定した決定事項

| #   | 論点                 | 決定                                       | 理由                                                                                                |
| --- | -------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 1   | 送信回数             | **3 日前 + 当日の 2 通**                   | ADR-012 の記述どおり。7 日間で 3 通以上は密度が高くしつこい                                         |
| 2   | 発火方式             | **EventBridge Rule + API destination**     | サイレント故障を CloudWatch で検知できる。F15 が同じ仕組みに乗れる。増分は月 $0.40                  |
| 3   | 送信記録             | **専用テーブル `TrialNotification`**       | 既存 `WebhookEvent` / `ClerkWebhookEvent` と同じ冪等性パターン。unique 制約が二重送信を構造的に拒否 |
| 4   | 終了日時の参照元     | **`Subscription.currentPeriodEnd` を流用** | `status = TRIALING` 併記で成立し migration 不要                                                     |
| 5   | カード登録済みの扱い | **送信対象から外す**                       | 通知の目的は転換。転換済みの人に送る理由がない                                                      |
| 6   | トライアル終了時刻   | **JST の日末(23:59:59)に揃える**           | 「当日通知」を定義可能にする。判定が時間差から日付差になり単純化する                                |

### 前提の是正(調査で判明した実態との差分)

| F20 の元記述                            | 実態                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Subscription.trialEndsAt` から対象抽出 | **`trialEndsAt` は存在しません。** 終了日時は `currentPeriodEnd` が兼務しています(`billing.service.ts:77-87`) |
| 7 日 / 3 日 / 当日 の 3 通              | **7 日前 = トライアル開始当日**で成立しません。ADR-012 v1.x 節の記述も「3 日前、当日」の 2 通です             |

---

## 2. トライアル終了時刻の日境界化

### 課題

バッチは 03:00 UTC(12:00 JST)固定で実行しますが、トライアル終了時刻は `trial_period_days: 7` により**テナント作成時刻に依存**します。作成が朝 9 時なら終了も 7 日後の朝 9 時で、12:00 の実行時点では既に終了しています。厳密な「当日通知」が原理的に作れません。

### 変更

`trial_period_days`(日数)を `trial_end`(明示的タイムスタンプ)に置き換え、JST の日末に揃えます。

```diff
  // apps/api/src/billing/billing.service.ts : initializeProTrialSubscription
  const stripeSub = await this.stripe.client.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId, quantity: 1 }],
-   trial_period_days: TRIAL_PERIOD_DAYS,
+   // 終了時刻を JST の日末に揃える(F20 の「当日通知」を定義可能にするため)。
+   // JST は夏時間が無いので固定 +9 で正確。dayjs の timezone プラグインは不要。
+   trial_end: dayjs().utcOffset(9).add(TRIAL_PERIOD_DAYS, 'day').endOf('day').unix(),
    trial_settings: {
      end_behavior: { missing_payment_method: 'cancel' },
    },
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    metadata: { [META_TENANT_ID]: tenant.id },
  });
```

`apps/api/src/common/time.ts` は `utc` プラグインのみを extend していますが、`utcOffset(9)` はそれで利用できます。

### 副作用

| 項目                       | 内容                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| トライアル実質長           | 7 日 + 当日の残り = **7〜8 日弱**。ユーザー間で最大 24 時間の差が出ます。原価は AI クレジット 300cr が上限なので青天井にはなりません          |
| ADR-012 の「7 日間」表記   | 注記が必要です。LP / 料金表の「7 日間無料」は誤りにはならない範囲と判断します                                                                 |
| Stripe ダッシュボード      | trial の表示が「7 days」固定ではなくなります                                                                                                  |
| 既存のトライアル中テナント | 本変更は新規作成分にのみ効きます。既存分は §4 の `currentPeriodEnd > now` 条件で「実行時点で終了済み」が除外され、最悪 1 通少なくなるだけです |

---

## 3. データモデル

```prisma
/// トライアル終了通知の送信記録(F20)。(tenantId, kind) の unique 制約が二重送信を構造的に防ぎます。
enum TrialNotificationKind {
  /// 終了 3 日前(日差 1〜3 の未送信で拾う)
  THREE_DAYS
  /// 終了当日(日差 0)
  LAST_DAY
}

model TrialNotification {
  /// 内部 ID(cuid)
  id       String                @id @default(cuid())
  /// 対象テナント ID
  tenantId String
  /// 通知種別
  kind     TrialNotificationKind
  /// 送信日時(予約 INSERT の時刻。送信失敗時は行ごと削除される)
  sentAt   DateTime              @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, kind])
}
```

`Tenant` に `trialNotifications TrialNotification[]` を追加します。テナント削除時は Cascade で消えます。

**`packages/db/src/tenant-extension.ts` の `TENANT_SCOPED_MODELS` に `'TrialNotification'` を追加します。** 同ファイルのコメントが「schema に tenantId 付きモデルを追加したら必ず本 Set にも追加すること(自動注入の網羅性はこの Set が唯一の担保)」と定めているためです。バッチは ALS のテナントコンテキストを持たないため実行時の注入は no-op になりますが、Set への登録自体は規約どおり行います。

---

## 4. 対象抽出と判定

DB で候補を絞り、各候補について Stripe でカード登録の有無を確認します。日次で数件規模のため 1 件ずつの参照で足ります。

### 候補抽出

```
Subscription WHERE status = TRIALING
               AND currentPeriodEnd IS NOT NULL
               AND currentPeriodEnd > now          -- 実行時点で終了済みは除外
               AND currentPeriodEnd <= now + 4 days -- 日差 3 までを含む余裕を持たせた上限
  INCLUDE tenant.owner (email, name), tenant (slug, name)
```

### 種別の判定

終了時刻が JST 日末に揃うため、**日付差**で判定します。

```
日差 = 終了日(JST) − 実行日(JST)

日差 0     → LAST_DAY
日差 1〜3  → THREE_DAYS(未送信の場合のみ。バッチが 1 日落ちても翌日に拾えます)
日差 4 以上 → 対象外
```

| 実行日     | trial_end = Day7 23:59 JST | 日差 | 送信                    |
| ---------- | -------------------------- | ---- | ----------------------- |
| Day4 12:00 | Day7                       | 3    | ✉ THREE_DAYS            |
| Day5 12:00 | Day7                       | 2    | — (送信済みのため skip) |
| Day6 12:00 | Day7                       | 1    | — (送信済みのため skip) |
| Day7 12:00 | Day7                       | 0    | ✉ LAST_DAY              |

### 除外条件

| 条件               | 判定方法                                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| カード登録済み     | Stripe から Subscription を取得し、`default_payment_method` または Customer の `invoice_settings.default_payment_method` のいずれかが存在すれば登録済みと判定します(Portal 経由の追加も拾うため両方見ます) |
| 該当種別が送信済み | `TrialNotification` の unique 制約(§5 の予約 INSERT で判定)                                                                                                                                                |

Stripe 参照が失敗した候補はその日は skip し、次回実行に回します(外部 API 障害で送信記録を汚さないため)。

---

## 5. 送信と冪等性

`AIUsageService` のクレジット予約パターン(reserve → 実行 → finalize / release)と同じ形にします。

1. **予約**: `TrialNotification` を先に INSERT します。unique 違反なら「他インスタンスが処理中 / 送信済み」なので skip します
2. **送信**: `MailService.sendTrialReminder(...)` を実行します
3. **解放**: 送信が失敗したら INSERT した行を DELETE し、翌日リトライできる状態に戻します

これにより、EventBridge の 24 時間リトライでも App Runner のスケールによる多重発火でも二重送信しません。

**残る穴**: 送信成功後・DELETE 判定前にプロセスが落ちた場合、翌日に 1 回だけ重複送信される可能性があります。発生確率が極小で実害も軽微(同じ通知が 2 回届く)なため、許容します。

---

## 6. API エンドポイントと認証

### エンドポイント

```
POST /internal/jobs/trial-reminders
Header: X-Internal-Job-Token: <INTERNAL_JOB_TOKEN>
```

### 認証

`InternalJobGuard` がヘッダを `INTERNAL_JOB_TOKEN` と `crypto.timingSafeEqual` で比較します。

- グローバルガードは存在しないため、新規コントローラは自前でガードを持ちます
- `TenantMiddleware` は `X-Tenant-Slug` 無しのリクエストを素通しするため、テナント無しで通過します(webhook と同じ経路)
- **env 未設定でも起動は止めません。** エンドポイントが 500 を返す方式に揃えます(`CLERK_WEBHOOK_SECRET` のプレースホルダで本番 bootstrap ごと落ちた事故の踏襲、`webhooks.controller.ts` のコメント参照)

### レスポンス

```jsonc
// 200
{ "processed": 5, "sent": { "threeDays": 2, "lastDay": 1 }, "skipped": 2, "failed": 0 }
```

**個別の送信が全件失敗しても 200 を返します。** 500 を返すと EventBridge がリトライし、成功済みの分を再送するリスクを生むためです。500 は DB 接続断など処理自体を開始できなかった場合に限定します。

---

## 7. インフラ(EventBridge)

EventBridge **Scheduler** は任意の HTTPS を直接ターゲットにできない(ターゲットは Lambda / SQS / SNS 等の AWS API のみ)ため、**Rule + API destination** の構成を採ります。

```
aws_cloudwatch_event_connection      認証方式 API_KEY(ヘッダ名 X-Internal-Job-Token)
aws_cloudwatch_event_api_destination POST https://api.neorie.com/internal/jobs/trial-reminders
aws_cloudwatch_event_rule            schedule_expression = "cron(0 3 * * ? *)"  -- 12:00 JST
aws_cloudwatch_event_target          rule → api_destination(invoke 用 IAM role 付き)
aws_cloudwatch_metric_alarm          FailedInvocations > 0 → 既存 SNS トピック
```

### コスト

| 項目                                                    | 月額                  |
| ------------------------------------------------------- | --------------------- |
| スケジュールルールの発火                                | $0.00                 |
| API destination 呼び出し(30 回)                         | $0.00($0.20 / 100 万) |
| **Connection が作る Secrets Manager シークレット 1 本** | **$0.40**             |

AWS フロア月 $36〜40 に対する増分 **$0.40** です。AWS クレジットは 2026-11 頃に尽きる見込み(`infrastructure-cost.md` §2.7)なので、それ以降は実費に乗ります。

### 環境変数

`INTERNAL_JOB_TOKEN` を追加します。`implementation-rules.md` の env 追加ルールに従い、以下を**同時に**更新します。

- `apps/api/.env.example`
- `infra/prod/secrets.tf` の `app_secret_keys`(10 → **11 キー**)
- `docs/runbooks/adr-012-release-checklist.md` §2 の投入手順

---

## 8. メールテンプレート

`apps/api/src/mail/emails/trial-reminder-email.tsx` を新規作成し、`kind` を props で受けて文面を出し分けます(1 コンポーネント 2 パターン)。

| 種別         | 件名                                                     | 本文の骨子                                                                                        |
| ------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `THREE_DAYS` | あと **{daysLeft}** 日で Neorie のトライアルが終了します | 終了日時の明示 / 終了後は AI 機能が停止しプロジェクト閲覧のみになること / Pro ¥1,480 の内容 / CTA |
| `LAST_DAY`   | 本日 Neorie のトライアルが終了します                     | 同上 + 「本日 23:59 に終了します」の具体日時                                                      |

**件名の日数は固定値ではなく実際の日差を埋めます。** §4 のとおり `THREE_DAYS` は「日差 1〜3 かつ未送信」で拾うため、バッチが 1 日落ちた翌日に送ると実際の残りは 2 日や 1 日になります。固定文言にすると本文と事実が食い違うので、`daysLeft` を props で渡して件名・本文の両方に反映します。

- 宛先は `Tenant.owner`(`ownerId` → `User.email`)です。トライアルはテナント作成時に必ず 1 人の状態で始まるため、ここに判断の余地はありません
- CTA は `${APP_BASE_URL}/w/{tenant.slug}/settings/billing` です
- 日時表記は既存の `sendInvitation` と同じく `dayjs(...).format('YYYY/MM/DD HH:mm')` に揃えます
- `MailService` に `sendTrialReminder(...)` を追加します(ADR-007 の「機能特化メソッドを足す」方針どおり)

---

## 9. エラー処理と監視

| 事象                 | 挙動                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| 個別のメール送信失敗 | 予約行を DELETE して続行。集計の `failed` に加算し、`Logger.error` に出力  |
| Stripe 参照失敗      | その候補のみ skip して続行(送信記録は作らない)                             |
| バッチ全体の失敗     | 500 を返し、EventBridge の `FailedInvocations` → CloudWatch アラーム → SNS |
| **発火しなかった**   | 同上のアラームで検知します                                                 |

ジョブ本体は処理件数を構造化ログに出し、「発火したが対象 0 件」と「発火しなかった」を区別できるようにします。2026-08-15 の Stripe Webhook 障害(9 日間サイレントに停止)と同じ壊れ方を避けることが、EventBridge を選んだ主目的です。

---

## 10. 影響ファイル

### 新規

```
apps/api/src/jobs/jobs.module.ts
apps/api/src/jobs/jobs.controller.ts
apps/api/src/jobs/internal-job.guard.ts
apps/api/src/jobs/jobs.constants.ts
apps/api/src/jobs/trial-reminder.service.ts
apps/api/src/jobs/trial-reminder.service.spec.ts
apps/api/src/mail/emails/trial-reminder-email.tsx
packages/db/prisma/migrations/<timestamp>_add_trial_notification/migration.sql
infra/prod/scheduler.tf
```

### 修正

```
packages/db/prisma/schema.prisma            TrialNotification + enum + Tenant relation
packages/db/src/tenant-extension.ts         TENANT_SCOPED_MODELS に TrialNotification を追加
packages/db/src/index.ts                    TrialNotificationKind を re-export
apps/api/src/common/time.ts                 JST_OFFSET_HOURS を共通化(CLAUDE.md の日付規約)
apps/api/src/app.module.ts                  JobsModule を登録
apps/api/src/billing/billing.service.ts     trial_period_days → trial_end(§2)
apps/api/src/mail/mail.service.ts           sendTrialReminder を追加
apps/api/.env.example                       INTERNAL_JOB_TOKEN
infra/prod/secrets.tf                       app_secret_keys を 11 キーに
infra/prod/monitoring.tf                    FailedInvocations アラーム
docs/adr/012-plan-structure-revision.md     v1.x 節を実装済みに + 「7 日間」への注記
docs/runbooks/adr-012-release-checklist.md  §2 に INTERNAL_JOB_TOKEN の投入手順
docs/PROJECT_STATUS.md                      §9.12.2 の F20 行 + 変更履歴
```

---

## 11. テスト

`trial-reminder.service.spec.ts`(Vitest、ADR-014 Task 4 で導入済み)で以下 5 系統を検証します。

| #   | 観点                  | 内容                                                                 |
| --- | --------------------- | -------------------------------------------------------------------- |
| 1   | 日差の境界            | 日差 0 / 1 / 3 / 4、および `currentPeriodEnd <= now`(終了済み)の扱い |
| 2   | 送信済みの skip       | `TrialNotification` が既にある場合に送信しないこと                   |
| 3   | カード登録済みの skip | Subscription 側 / Customer 側それぞれに PM がある場合                |
| 4   | 送信失敗時の解放      | `MailService` が throw したとき予約行が DELETE されること            |
| 5   | 集計レスポンス        | processed / sent / skipped / failed が実際の処理数と一致すること     |

EventBridge から本番エンドポイントまでの疎通は `terraform apply` 後に 1 回手動で確認します(Rule を一時的に 5 分間隔にして発火を見る、または API destination を手動 invoke)。

---

## 12. 想定工数

| 項目                                                             | 見積        |
| ---------------------------------------------------------------- | ----------- |
| BE(schema + migration + jobs モジュール + テンプレート + テスト) | 0.6 Day     |
| infra(scheduler.tf + secrets + アラーム + apply 検証)            | 0.3 Day     |
| `trial_end` の日境界化 + ADR-012 注記                            | 0.1 Day     |
| **合計**                                                         | **1.0 Day** |
