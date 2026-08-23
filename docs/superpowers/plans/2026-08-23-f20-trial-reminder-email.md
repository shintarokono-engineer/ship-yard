# F20 トライアル終了通知メール Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** トライアル終了の 3 日前と当日に、カード未登録のワークスペースオーナーへ通知メールを送る日次バッチを作ります。

**Architecture:** EventBridge Rule + API destination が毎日 03:00 UTC に保護された内部エンドポイント `POST /internal/jobs/trial-reminders` を叩きます。`TrialReminderService` が `Subscription`(`status = TRIALING`)から候補を抽出し、Stripe でカード登録の有無を確認して、`TrialNotification` への予約 INSERT で冪等性を担保しながら Resend でメールを送ります。判定を「JST 日付差」で行えるよう、トライアル終了時刻を JST 日末に揃える変更も含みます。

**Tech Stack:** NestJS 11 / Prisma 6 / Vitest 4 / Resend + React Email / Stripe SDK v22 / Terraform (AWS EventBridge)

**Spec:** [`docs/superpowers/specs/2026-08-23-f20-trial-reminder-email-design.md`](../specs/2026-08-23-f20-trial-reminder-email-design.md)

---

## ファイル構成

| ファイル                                            | 責務                                                           |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `packages/db/prisma/schema.prisma`                  | `TrialNotification` model + `TrialNotificationKind` enum       |
| `packages/db/src/tenant-extension.ts`               | `TENANT_SCOPED_MODELS` への登録(規約)                          |
| `packages/db/src/index.ts`                          | enum / 型の re-export                                          |
| `apps/api/src/common/time.ts`                       | `JST_OFFSET_HOURS` の共通化(billing / jobs / mail から使う)    |
| `apps/api/src/billing/billing.service.ts`           | `computeTrialEndUnix`(純関数)+ `trial_end` への差し替え        |
| `apps/api/src/billing/billing.service.spec.ts`      | 上記純関数のテスト                                             |
| `apps/api/src/jobs/jobs.constants.ts`               | 日差の閾値・候補抽出ウィンドウ・ヘッダ名                       |
| `apps/api/src/jobs/trial-reminder.service.ts`       | 純関数(日差判定 / PM 判定)+ バッチ本体の I/O                   |
| `apps/api/src/jobs/trial-reminder.service.spec.ts`  | 純関数のテスト                                                 |
| `apps/api/src/jobs/internal-job.guard.ts`           | `X-Internal-Job-Token` の検証                                  |
| `apps/api/src/jobs/jobs.controller.ts`              | `POST /internal/jobs/trial-reminders`                          |
| `apps/api/src/jobs/jobs.module.ts`                  | 上記の DI 登録                                                 |
| `apps/api/src/mail/emails/trial-reminder-email.tsx` | メール本文(`daysLeft` で文面を出し分け)                        |
| `apps/api/src/mail/mail.service.ts`                 | `sendTrialReminder` の追加                                     |
| `infra/prod/scheduler.tf`                           | EventBridge connection / api_destination / rule / target / IAM |
| `infra/prod/monitoring.tf`                          | `FailedInvocations` アラーム                                   |
| `infra/prod/secrets.tf`                             | `INTERNAL_JOB_TOKEN` を `app_secret_keys` に追加               |

**責務分割の方針:** このリポジトリのテストは「Service から純関数を export し、DI を使わず直接テストする」パターン(`creditsForUsage` / `hashInvitationToken` / `computeInvitationStatus`)で統一されています。本計画もこれに揃え、判定ロジックを純関数として切り出してテストし、I/O を含む `run()` はテスト対象外とします。

---

## Task 1: Prisma スキーマに TrialNotification を追加する

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/tenant-extension.ts:28-43`
- Modify: `packages/db/src/index.ts:19-46`
- Create: `packages/db/prisma/migrations/<timestamp>_add_trial_notification/migration.sql`(`migrate:dev` が自動生成)

- [ ] **Step 1: schema.prisma に enum と model を追加する**

ファイル末尾の enum 群の近くに追記します。

```prisma
/// トライアル終了通知の種別(F20、ADR-012 v1.x)
enum TrialNotificationKind {
  /// 終了 3 日前(実際は JST 日差 1〜3 の未送信を拾う。バッチが 1 日落ちても翌日に送れるようにするため)
  THREE_DAYS
  /// 終了当日(JST 日差 0)
  LAST_DAY
}

/// トライアル終了通知の送信記録(F20)。
/// `(tenantId, kind)` の unique 制約が二重送信を構造的に防ぐ(App Runner のスケール多重発火 /
/// EventBridge の 24 時間リトライの両方に対する防御)。
model TrialNotification {
  /// 内部 ID(cuid)
  id       String                @id @default(cuid())
  /// 対象テナント ID
  tenantId String
  /// 通知種別
  kind     TrialNotificationKind
  /// 送信日時(予約 INSERT の時刻。送信に失敗した場合は行ごと削除して翌日リトライ可能に戻す)
  sentAt   DateTime              @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, kind])
}
```

- [ ] **Step 2: Tenant モデルに relation を足す**

`model Tenant` のリレーション定義群(`members TenantMember[]` の並び)に 1 行追加します。

```prisma
  trialNotifications TrialNotification[]
```

- [ ] **Step 3: TENANT_SCOPED_MODELS に登録する**

`packages/db/src/tenant-extension.ts` の Set は「自動注入の網羅性の唯一の担保」とコメントで定義されています。tenantId を持つモデルを足したら必ず登録します。

```ts
const TENANT_SCOPED_MODELS = new Set<string>([
  'Project',
  'ChecklistItem',
  'ProjectDocument',
  'AIUsage',
  'InvitationToken',
  'LandingPage',
  'ServiceScore',
  'IdeaValidation',
  'RagQaSession',
  'RagQaMessage',
  'Announcement',
  'Delivery',
  'BlogPost',
  // F20 トライアル終了通知。日次バッチは ALS のテナントコンテキストを持たないため実行時の
  // 注入は no-op になるが、tenantId を持つモデルは例外なく登録する規約に従う。
  'TrialNotification',
]);
```

- [ ] **Step 4: db パッケージから re-export する**

`packages/db/src/index.ts` の enum ブロックと型ブロックにそれぞれ追記します。

```ts
export {
  Plan,
  Role,
  ProjectStatus,
  ItemStatus,
  Category,
  DocType,
  Feature,
  RagQaRole,
  SubStatus,
  WebhookStatus,
  // ADR-014 マルチチャネル告知配信
  AnnouncementStatus,
  DeliveryChannel,
  DeliveryStatus,
  // F20 トライアル終了通知
  TrialNotificationKind,
} from '@prisma/client';
```

```ts
export type {
  RagQaSession,
  RagQaMessage,
  LandingPage,
  ServiceScore,
  IdeaValidation,
  // ADR-014 マルチチャネル告知配信
  Announcement,
  Delivery,
  BlogPost,
  // F20 トライアル終了通知
  TrialNotification,
} from '@prisma/client';
```

- [ ] **Step 5: migration を生成して適用する**

Docker Postgres が起動していることを確認してから実行します。

Run:

```bash
pnpm db:up
pnpm --filter @shipyard/db migrate:dev --name add_trial_notification
```

Expected: `migrations/<timestamp>_add_trial_notification/migration.sql` が生成され、`CREATE TYPE "TrialNotificationKind"` と `CREATE TABLE "TrialNotification"` を含む。適用が成功し `Your database is now in sync with your schema.` が出る。

- [ ] **Step 6: 型生成とビルドを確認する**

Run:

```bash
pnpm --filter @shipyard/db build && pnpm --filter @shipyard/api type-check
```

Expected: どちらもエラーなく終了する。

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/src/tenant-extension.ts packages/db/src/index.ts
git commit -m "feat(db): トライアル終了通知の送信記録テーブルを追加する

(tenantId, kind) の unique 制約で二重送信を構造的に防ぐ。tenantId を
持つモデルの規約どおり TENANT_SCOPED_MODELS にも登録した。"
```

---

## Task 2: トライアル終了時刻を JST 日末に揃える

現状 `trial_period_days: 7` はテナント作成時刻の 7 日後を終了時刻にするため、終了時刻がユーザーごとにバラバラです。バッチは 12:00 JST 固定なので「当日通知」が定義できません。`trial_end` を明示的に渡して JST 日末に揃えます。

**Files:**

- Modify: `apps/api/src/billing/billing.service.ts:14`(定数の直下に純関数を追加)、`:60-76`(呼び出し箇所)
- Create: `apps/api/src/billing/billing.service.spec.ts`

- [ ] **Step 1: 失敗するテストを書く**

Create `apps/api/src/billing/billing.service.spec.ts`:

```ts
import { dayjs } from '../common/time';
import { computeTrialEndUnix } from './billing.service';

/**
 * F20:トライアル終了時刻を JST の日末に揃える。
 * 作成時刻が何時であっても「作成日 + 7 日の 23:59:59 JST」に収束することを確認する。
 */
describe('computeTrialEndUnix', () => {
  const jstLabel = (unix: number): string =>
    dayjs.unix(unix).utcOffset(9).format('YYYY-MM-DD HH:mm:ss');

  it('JST 午前に作成しても終了は 7 日後の 23:59:59 JST', () => {
    // 2026-08-23T00:00:00Z = 2026-08-23 09:00 JST
    expect(jstLabel(computeTrialEndUnix(new Date('2026-08-23T00:00:00Z')))).toBe(
      '2026-08-30 23:59:59',
    );
  });

  it('JST 深夜 0 時ちょうどに作成しても同じ日付の 7 日後になる', () => {
    // 2026-08-22T15:00:00Z = 2026-08-23 00:00 JST
    expect(jstLabel(computeTrialEndUnix(new Date('2026-08-22T15:00:00Z')))).toBe(
      '2026-08-30 23:59:59',
    );
  });

  it('JST 23:59 に作成しても同じ日付の 7 日後になる', () => {
    // 2026-08-23T14:59:00Z = 2026-08-23 23:59 JST
    expect(jstLabel(computeTrialEndUnix(new Date('2026-08-23T14:59:00Z')))).toBe(
      '2026-08-30 23:59:59',
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm --filter @shipyard/api test -- src/billing/billing.service.spec.ts`

Expected: FAIL。`computeTrialEndUnix` が export されていないため import エラーになる。

- [ ] **Step 3: JST オフセットを共通化する**

JST のオフセットは本計画で 3 ファイル(billing / jobs / mail)から使います。CLAUDE.md が「日付・時刻は `apps/api/src/common/time.ts` から import」と定めているため、定数もここに置きます。

`apps/api/src/common/time.ts` を以下に書き換えます。

```ts
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// UTC プラグインを 1 回だけ extend する。日付・時刻の処理はここから import した dayjs を使う。
dayjs.extend(utc);

/**
 * JST の UTC オフセット(時間)。日本は夏時間が無いため固定 +9 で正確に扱える。
 * `dayjs(d).utcOffset(JST_OFFSET_HOURS)` の形で使う(timezone プラグインは不要)。
 */
export const JST_OFFSET_HOURS = 9;

export { dayjs };
```

- [ ] **Step 4: 純関数を実装する**

`apps/api/src/billing/billing.service.ts` の import を差し替えます。

```ts
import { dayjs, JST_OFFSET_HOURS } from '../common/time';
```

`TRIAL_PERIOD_DAYS` 定義の直後に追加します。

```ts
/** ADR-012 で確定した Pro トライアル期間。Stripe `trial_end` の算出に使う。 */
const TRIAL_PERIOD_DAYS = 7;

/**
 * トライアル終了時刻(Stripe `trial_end` に渡す UNIX 秒)を返す。
 *
 * `trial_period_days` を使うと終了時刻がテナント作成時刻に依存してバラバラになり、
 * 12:00 JST 固定の日次バッチ(F20)から「終了当日」を判定できない。そこで終了時刻を
 * **JST の日末(23:59:59)** に揃え、日付差だけで通知種別を決められるようにする。
 *
 * 副作用として実質のトライアル長は 7 日 + 当日の残り(= 7〜8 日弱)になる。
 * 原価は AI クレジット 300cr が上限のため青天井にはならない(ADR-012 §2 の注記参照)。
 */
export function computeTrialEndUnix(now: Date = new Date()): number {
  return dayjs(now).utcOffset(JST_OFFSET_HOURS).add(TRIAL_PERIOD_DAYS, 'day').endOf('day').unix();
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm --filter @shipyard/api test -- src/billing/billing.service.spec.ts`

Expected: PASS(3 件)。

- [ ] **Step 6: Stripe 呼び出しを差し替える**

`initializeProTrialSubscription` の `subscriptions.create` を修正します。

```ts
const stripeSub = await this.stripe.client.subscriptions.create({
  customer: customerId,
  items: [{ price: priceId, quantity: 1 }],
  // 終了時刻を JST の日末に揃える(F20 の「当日通知」を定義可能にするため)。
  trial_end: computeTrialEndUnix(),
  trial_settings: {
    end_behavior: { missing_payment_method: 'cancel' },
  },
  payment_settings: {
    save_default_payment_method: 'on_subscription',
  },
  metadata: { [META_TENANT_ID]: tenant.id },
});
```

`trial_period_days: TRIAL_PERIOD_DAYS,` の行は削除します。

- [ ] **Step 7: 型チェックと全テストを流す**

Run: `pnpm --filter @shipyard/api type-check && pnpm test:api`

Expected: どちらも PASS。

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/common/time.ts apps/api/src/billing/billing.service.ts apps/api/src/billing/billing.service.spec.ts
git commit -m "feat(billing): トライアル終了時刻を JST の日末に揃える

trial_period_days では終了時刻が作成時刻に依存してバラバラになり、
12:00 JST 固定の日次バッチから「終了当日」を判定できない。trial_end を
明示的に渡して日境界に揃え、日付差だけで通知種別を決められるようにした。"
```

---

## Task 3: 通知種別を決める純関数を作る

**Files:**

- Create: `apps/api/src/jobs/jobs.constants.ts`
- Create: `apps/api/src/jobs/trial-reminder.service.ts`(この Task では純関数のみ)
- Create: `apps/api/src/jobs/trial-reminder.service.spec.ts`

- [ ] **Step 1: 定数ファイルを作る**

Create `apps/api/src/jobs/jobs.constants.ts`:

```ts
/**
 * 内部ジョブ(F20 トライアル終了通知 / 将来の F15 Reconciliation)の定数。
 * マジックナンバーを散らさないため、閾値はすべてここに集約する。
 */

/**
 * 「3 日前通知」として拾う JST 日付差の上限。
 * 日差 3 ちょうどだけを対象にするとバッチが 1 日落ちた日の分を永久に取りこぼすため、
 * 1〜3 の幅を持たせて未送信なら翌日以降でも送れるようにする。
 */
export const THREE_DAYS_MAX_DIFF = 3;

/**
 * 候補抽出の上限(日)。日差 3(最大 約 84 時間先)を確実に含む余裕を持たせた値。
 * これを超える終了日時は DB クエリの時点で除外する。
 */
export const CANDIDATE_WINDOW_DAYS = 4;

/** 内部ジョブエンドポイントの認証ヘッダ名(Express は小文字で受け取る)。 */
export const INTERNAL_JOB_TOKEN_HEADER = 'x-internal-job-token';
```

- [ ] **Step 2: 失敗するテストを書く**

Create `apps/api/src/jobs/trial-reminder.service.spec.ts`:

```ts
import { TrialNotificationKind } from '@shipyard/db';

import { daysLeftFor, resolveNotificationKind } from './trial-reminder.service';

/** バッチの実行時刻。2026-08-23T03:00:00Z = 2026-08-23 12:00 JST。 */
const NOW = new Date('2026-08-23T03:00:00Z');

/** JST の指定日 23:59:59 を UTC の Date にする(トライアル終了時刻の形)。 */
const jstEndOfDay = (isoDate: string): Date => new Date(`${isoDate}T14:59:59Z`);

describe('daysLeftFor(JST の日付差)', () => {
  it('同じ JST 日なら 0', () => {
    expect(daysLeftFor(jstEndOfDay('2026-08-23'), NOW)).toBe(0);
  });

  it('翌 JST 日なら 1', () => {
    expect(daysLeftFor(jstEndOfDay('2026-08-24'), NOW)).toBe(1);
  });

  it('3 日後なら 3', () => {
    expect(daysLeftFor(jstEndOfDay('2026-08-26'), NOW)).toBe(3);
  });
});

describe('resolveNotificationKind', () => {
  it('日差 0(終了当日)は LAST_DAY', () => {
    expect(resolveNotificationKind(jstEndOfDay('2026-08-23'), NOW)).toBe(
      TrialNotificationKind.LAST_DAY,
    );
  });

  it('日差 3 は THREE_DAYS', () => {
    expect(resolveNotificationKind(jstEndOfDay('2026-08-26'), NOW)).toBe(
      TrialNotificationKind.THREE_DAYS,
    );
  });

  it('日差 1 も THREE_DAYS(バッチが落ちた日の取りこぼしを翌日に拾うため)', () => {
    expect(resolveNotificationKind(jstEndOfDay('2026-08-24'), NOW)).toBe(
      TrialNotificationKind.THREE_DAYS,
    );
  });

  it('日差 4 以上は対象外', () => {
    expect(resolveNotificationKind(jstEndOfDay('2026-08-27'), NOW)).toBeNull();
  });

  it('実行時点で既に終了している場合は対象外', () => {
    expect(resolveNotificationKind(new Date('2026-08-23T02:00:00Z'), NOW)).toBeNull();
  });

  it('終了時刻が実行時刻ちょうどの場合も対象外(境界は終了扱い)', () => {
    expect(resolveNotificationKind(new Date(NOW), NOW)).toBeNull();
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `pnpm --filter @shipyard/api test -- src/jobs/trial-reminder.service.spec.ts`

Expected: FAIL。`./trial-reminder.service` が存在しないため解決エラーになる。

- [ ] **Step 4: 純関数を実装する**

Create `apps/api/src/jobs/trial-reminder.service.ts`:

```ts
import { TrialNotificationKind } from '@shipyard/db';

import { dayjs, JST_OFFSET_HOURS } from '../common/time';
import { THREE_DAYS_MAX_DIFF } from './jobs.constants';

/**
 * トライアル終了日時と実行時刻の **JST 日付差** を返す(0 = 終了当日)。
 *
 * 時間差ではなく日付差で扱うのは、`computeTrialEndUnix`(billing.service.ts)が
 * 終了時刻を JST 日末に揃えているため。これにより「3 日前」「当日」が
 * 実行時刻に依存せず一意に決まる。
 */
export function daysLeftFor(currentPeriodEnd: Date, now: Date): number {
  const endDay = dayjs(currentPeriodEnd).utcOffset(JST_OFFSET_HOURS).startOf('day');
  const nowDay = dayjs(now).utcOffset(JST_OFFSET_HOURS).startOf('day');
  return endDay.diff(nowDay, 'day');
}

/**
 * 送るべき通知種別を返す。対象外なら null。
 *
 * - 日差 0 → LAST_DAY(終了当日)
 * - 日差 1〜3 → THREE_DAYS(未送信のものだけが実際に送られる。送信済み判定は
 *   `TrialNotification` の unique 制約が行うため、ここでは幅を持たせてよい)
 * - 実行時点で終了済み、または日差 4 以上 → null
 */
export function resolveNotificationKind(
  currentPeriodEnd: Date,
  now: Date,
): TrialNotificationKind | null {
  if (currentPeriodEnd.getTime() <= now.getTime()) return null;

  const diff = daysLeftFor(currentPeriodEnd, now);
  if (diff === 0) return TrialNotificationKind.LAST_DAY;
  if (diff >= 1 && diff <= THREE_DAYS_MAX_DIFF) return TrialNotificationKind.THREE_DAYS;
  return null;
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm --filter @shipyard/api test -- src/jobs/trial-reminder.service.spec.ts`

Expected: PASS(9 件)。

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/jobs/jobs.constants.ts apps/api/src/jobs/trial-reminder.service.ts apps/api/src/jobs/trial-reminder.service.spec.ts
git commit -m "feat(jobs): トライアル通知の種別判定を純関数として実装する

終了時刻が JST 日末に揃っているため、時間差ではなく日付差で判定できる。
3 日前通知は日差 1〜3 で拾い、バッチが 1 日落ちても翌日に送れるようにした。"
```

---

## Task 4: カード登録の有無を判定する純関数を作る

トライアル中にカードを登録済みのテナントは、終了時に解約ではなく課金開始へ遷移します。「登録しないと停止します」という文面と食い違うため送信対象から外します。

**Files:**

- Modify: `apps/api/src/jobs/trial-reminder.service.ts`
- Modify: `apps/api/src/jobs/trial-reminder.service.spec.ts`

- [ ] **Step 1: 失敗するテストを追記する**

`trial-reminder.service.spec.ts` の末尾に追記します。import 行にも `hasPaymentMethod` を足してください。

```ts
import type { Stripe } from '../stripe/stripe.types';

describe('hasPaymentMethod', () => {
  /** 判定に必要なフィールドだけを持つ最小オブジェクトを Stripe.Subscription として渡す。 */
  const asSub = (partial: unknown): Stripe.Subscription => partial as Stripe.Subscription;

  it('Subscription 側に default_payment_method があれば登録済み', () => {
    expect(hasPaymentMethod(asSub({ default_payment_method: 'pm_123', customer: 'cus_1' }))).toBe(
      true,
    );
  });

  it('Customer 側の invoice_settings に既定 PM があれば登録済み(Portal 経由の追加を拾う)', () => {
    expect(
      hasPaymentMethod(
        asSub({
          default_payment_method: null,
          customer: { invoice_settings: { default_payment_method: 'pm_456' } },
        }),
      ),
    ).toBe(true);
  });

  it('どちらにも無ければ未登録', () => {
    expect(
      hasPaymentMethod(
        asSub({
          default_payment_method: null,
          customer: { invoice_settings: { default_payment_method: null } },
        }),
      ),
    ).toBe(false);
  });

  it('customer が展開されず ID 文字列のままなら未登録として扱う', () => {
    expect(hasPaymentMethod(asSub({ default_payment_method: null, customer: 'cus_1' }))).toBe(
      false,
    );
  });

  it('削除済み Customer は未登録として扱う', () => {
    expect(
      hasPaymentMethod(
        asSub({ default_payment_method: null, customer: { deleted: true, id: 'cus_1' } }),
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm --filter @shipyard/api test -- src/jobs/trial-reminder.service.spec.ts`

Expected: FAIL。`hasPaymentMethod` が export されていない。

- [ ] **Step 3: 実装する**

`trial-reminder.service.ts` に追記します。import に `import type { Stripe } from '../stripe/stripe.types';` を足してください。

```ts
/**
 * トライアル中の Subscription に支払い方法が登録済みかを判定する。
 *
 * Checkout 経由の登録は Subscription の `default_payment_method` に、Customer Portal 経由の
 * 登録は Customer の `invoice_settings.default_payment_method` に入るため、**両方を見る**。
 * `customer` は `expand: ['customer']` で展開済みであることを前提とし、展開されていない場合
 * (ID 文字列)や削除済み Customer は判定不能なので「未登録」に倒す(通知を送る側に倒す)。
 */
export function hasPaymentMethod(sub: Stripe.Subscription): boolean {
  if (sub.default_payment_method) return true;

  const customer = sub.customer;
  if (typeof customer === 'string' || 'deleted' in customer) return false;

  return Boolean(customer.invoice_settings?.default_payment_method);
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm --filter @shipyard/api test -- src/jobs/trial-reminder.service.spec.ts`

Expected: PASS(14 件)。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/jobs/trial-reminder.service.ts apps/api/src/jobs/trial-reminder.service.spec.ts
git commit -m "feat(jobs): カード登録済み判定を追加する

Checkout 経由は Subscription、Portal 経由は Customer に既定 PM が入るため
両方を見る。判定不能な場合は通知を送る側に倒す。"
```

---

## Task 5: 通知メールのテンプレートと送信メソッドを作る

**Files:**

- Create: `apps/api/src/mail/emails/trial-reminder-email.tsx`
- Modify: `apps/api/src/mail/mail.service.ts`

- [ ] **Step 1: メールテンプレートを作る**

Create `apps/api/src/mail/emails/trial-reminder-email.tsx`:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { JSX } from 'react';

/**
 * トライアル終了通知メールテンプレート(F20、ADR-012 v1.x)。
 *
 * `MailService.sendTrialReminder` から呼ばれる。3 日前 / 当日で別コンポーネントにはせず、
 * `daysLeft` を受けて文面を出し分ける。3 日前通知は「日差 1〜3 の未送信」で拾うため
 * 実際の残り日数が 3 とは限らず、**固定文言にすると本文と事実が食い違う**ため。
 */
export interface TrialReminderEmailProps {
  /** ワークスペース名 */
  workspaceName: string;
  /** 残り日数(0 = 終了当日) */
  daysLeft: number;
  /** 終了日時の表示用文字列(フォーマット済み) */
  trialEndLabel: string;
  /** 課金設定ページの絶対 URL */
  billingUrl: string;
}

export function TrialReminderEmail({
  workspaceName,
  daysLeft,
  trialEndLabel,
  billingUrl,
}: TrialReminderEmailProps): JSX.Element {
  const isLastDay = daysLeft === 0;
  const headline = isLastDay
    ? '本日でトライアルが終了します'
    : `あと ${daysLeft} 日でトライアルが終了します`;

  return (
    <Html lang="ja">
      <Head />
      <Preview>{`${workspaceName}:${headline}`}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>{headline}</Heading>

          <Section>
            <Text style={textStyle}>
              ワークスペース「{workspaceName}」の Pro トライアルは <strong>{trialEndLabel}</strong>{' '}
              に終了します。
            </Text>
            <Text style={textStyle}>
              終了までにお支払い方法をご登録いただかない場合、AI
              機能(ドキュメント生成・壁打ち・診断・告知文生成)が停止し、プロジェクトの閲覧のみが可能な状態になります。
              <strong>作成済みのデータが削除されることはありません。</strong>
            </Text>
            <Text style={textStyle}>
              Pro プラン(月額 ¥1,480)を継続すると、引き続き月 300 クレジット分の AI
              機能をご利用いただけます。
            </Text>
          </Section>

          <Section style={buttonSectionStyle}>
            <Button href={billingUrl} style={buttonStyle}>
              お支払い方法を登録する
            </Button>
          </Section>

          <Section>
            <Text style={mutedTextStyle}>
              ボタンが効かない場合は、以下のリンクをブラウザで開いてください:
            </Text>
            <Link href={billingUrl} style={linkStyle}>
              {billingUrl}
            </Link>
          </Section>

          <Hr style={hrStyle} />

          <Section>
            <Text style={mutedTextStyle}>
              このメールは、トライアル期間中のワークスペースのオーナー宛にお送りしています。
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// スタイル定義(React Email では inline style を推奨。クラス CSS は Gmail で剥がされるため)
const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f5f7fa',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif',
  margin: 0,
  padding: '24px 0',
};

const containerStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  margin: '0 auto',
  maxWidth: '560px',
  padding: '32px',
};

const headingStyle: React.CSSProperties = {
  color: '#111827',
  fontSize: '22px',
  fontWeight: 700,
  margin: '0 0 24px',
};

const textStyle: React.CSSProperties = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 12px',
};

const mutedTextStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '13px',
  lineHeight: '1.6',
  margin: '0 0 8px',
};

const buttonSectionStyle: React.CSSProperties = {
  margin: '24px 0',
  textAlign: 'center',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: '#4f46e5',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: 600,
  padding: '12px 24px',
  textDecoration: 'none',
};

const linkStyle: React.CSSProperties = {
  color: '#4f46e5',
  fontSize: '13px',
  wordBreak: 'break-all',
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid #e5e7eb',
  margin: '24px 0',
};
```

- [ ] **Step 2: MailService に送信メソッドを足す**

`apps/api/src/mail/mail.service.ts` を修正します。import に `TrialReminderEmail` を追加し、`SendInvitationInput` の下に入力型を、`sendInvitation` の下にメソッドを追加します。

```ts
import { TrialReminderEmail } from './emails/trial-reminder-email';
```

```ts
/** `MailService.sendTrialReminder` の引数(TrialReminderService から渡す)。 */
export interface SendTrialReminderInput {
  /** 送信先(ワークスペースオーナーの email) */
  to: string;
  /** ワークスペース名(本文に表示) */
  workspaceName: string;
  /** ワークスペース slug(課金設定ページの URL 組み立てに使う) */
  workspaceSlug: string;
  /** 残り日数(0 = 終了当日) */
  daysLeft: number;
  /** トライアル終了日時 */
  trialEndsAt: Date;
}
```

```ts
  /**
   * トライアル終了の事前通知を送る(F20、ADR-012 v1.x)。
   *
   * 件名の日数は `daysLeft` から組み立てる。3 日前通知は「日差 1〜3 の未送信」で拾うため
   * 実際の残り日数が 3 とは限らず、固定文言にすると本文と食い違うため。
   *
   * 失敗時は例外をスローする。呼び出し側(TrialReminderService)が予約行を削除して
   * 翌日リトライ可能な状態に戻す。
   */
  async sendTrialReminder(input: SendTrialReminderInput): Promise<void> {
    const billingUrl = `${this.appBaseUrl}/w/${input.workspaceSlug}/settings/billing`;
    // 受信者は日本のユーザーを想定しているため、サーバのタイムゾーンに依存せず JST で表記する。
    const trialEndLabel = dayjs(input.trialEndsAt).utcOffset(9).format('YYYY/MM/DD HH:mm');

    const html = await render(
      createElement(TrialReminderEmail, {
        workspaceName: input.workspaceName,
        daysLeft: input.daysLeft,
        trialEndLabel,
        billingUrl,
      }),
    );

    const subject =
      input.daysLeft === 0
        ? '本日 Neorie のトライアルが終了します'
        : `あと ${input.daysLeft} 日で Neorie のトライアルが終了します`;

    const result = await this.resend.emails.send({
      from: this.from,
      to: input.to,
      subject,
      html,
    });

    if (result.error) {
      const msg = `Resend send failed: ${result.error.name} - ${result.error.message}`;
      this.logger.error(msg);
      throw new Error(msg);
    }
    this.logger.log(
      `Trial reminder sent to ${input.to} (daysLeft=${input.daysLeft}, id=${result.data?.id ?? 'unknown'})`,
    );
  }
```

- [ ] **Step 3: 型チェックを流す**

Run: `pnpm --filter @shipyard/api type-check`

Expected: エラーなし。

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/mail/emails/trial-reminder-email.tsx apps/api/src/mail/mail.service.ts
git commit -m "feat(mail): トライアル終了通知メールを追加する

件名・本文の日数は daysLeft から組み立てる。3 日前通知は日差 1〜3 で
拾うため、固定文言だと実際の残り日数と食い違うため。"
```

---

## Task 6: バッチ本体を実装する

**Files:**

- Modify: `apps/api/src/jobs/trial-reminder.service.ts`
- Modify: `apps/api/src/jobs/trial-reminder.service.spec.ts`

`run()` は I/O を含みますが、依存は 3 つとも constructor 注入なので、NestJS の TestingModule を使わずプレーンなフェイクを渡すだけでテストできます。spec §11 の「送信済み skip」「送信失敗時の解放」「集計」はこの形でしか検証できないため、純関数と同じファイルに追加します。

- [ ] **Step 1: 失敗するテストを追記する**

`trial-reminder.service.spec.ts` の末尾に追記します。import 行に `Prisma`, `TrialReminderService` を追加してください。

```ts
import { Prisma } from '@shipyard/db';

import { TrialReminderService } from './trial-reminder.service';

/** DB から返る候補 1 件(findMany の select に対応した形)。 */
const candidateRow = (overrides: Record<string, unknown> = {}) => ({
  stripeSubId: 'sub_1',
  currentPeriodEnd: jstEndOfDay('2026-08-23'), // 日差 0 = LAST_DAY
  tenant: {
    id: 't1',
    name: 'デモワークスペース',
    slug: 'demo',
    owner: { email: 'owner@example.com' },
  },
  ...overrides,
});

/** Prisma の unique 制約違反(P2002)を再現する。 */
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

/** フェイク依存を注入した TrialReminderService と、呼び出し記録を返す。 */
function buildService(opts: {
  candidates: ReturnType<typeof candidateRow>[];
  createThrows?: unknown;
  sendThrows?: unknown;
  /** Stripe が返す既定の支払い方法(null = 未登録) */
  paymentMethod?: string | null;
}) {
  const created: unknown[] = [];
  const deleted: unknown[] = [];
  const sent: unknown[] = [];

  const prisma = {
    subscription: { findMany: async () => opts.candidates },
    trialNotification: {
      create: async (args: { data: unknown }) => {
        if (opts.createThrows) throw opts.createThrows;
        created.push(args.data);
        return args.data;
      },
      delete: async (args: { where: unknown }) => {
        deleted.push(args.where);
        return args.where;
      },
    },
  };

  const stripe = {
    client: {
      subscriptions: {
        retrieve: async () => ({
          default_payment_method: opts.paymentMethod ?? null,
          customer: 'cus_1',
        }),
      },
    },
  };

  const mail = {
    sendTrialReminder: async (input: unknown) => {
      if (opts.sendThrows) throw opts.sendThrows;
      sent.push(input);
    },
  };

  const service = new TrialReminderService(prisma as never, stripe as never, mail as never);
  return { service, created, deleted, sent };
}

describe('TrialReminderService.run', () => {
  it('未送信・カード未登録なら送信し、集計に反映する', async () => {
    const { service, sent, created } = buildService({
      candidates: [
        candidateRow(),
        candidateRow({
          stripeSubId: 'sub_2',
          currentPeriodEnd: jstEndOfDay('2026-08-26'), // 日差 3 = THREE_DAYS
          tenant: {
            id: 't2',
            name: '別ワークスペース',
            slug: 'other',
            owner: { email: 'other@example.com' },
          },
        }),
      ],
    });

    const result = await service.run(NOW);

    expect(result).toEqual({
      processed: 2,
      sent: { threeDays: 1, lastDay: 1 },
      skipped: 0,
      failed: 0,
    });
    expect(sent).toHaveLength(2);
    expect(created).toHaveLength(2);
  });

  it('送信済み(unique 違反)ならメールを送らず skipped に数える', async () => {
    const { service, sent } = buildService({
      candidates: [candidateRow()],
      createThrows: uniqueViolation(),
    });

    const result = await service.run(NOW);

    expect(result.skipped).toBe(1);
    expect(result.sent).toEqual({ threeDays: 0, lastDay: 0 });
    expect(sent).toHaveLength(0);
  });

  it('カード登録済みならメールを送らず、予約 INSERT もしない', async () => {
    const { service, sent, created } = buildService({
      candidates: [candidateRow()],
      paymentMethod: 'pm_123',
    });

    const result = await service.run(NOW);

    expect(result.skipped).toBe(1);
    expect(sent).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it('送信に失敗したら予約行を削除して failed に数える', async () => {
    const { service, deleted } = buildService({
      candidates: [candidateRow()],
      sendThrows: new Error('Resend send failed'),
    });

    const result = await service.run(NOW);

    expect(result.failed).toBe(1);
    expect(deleted).toEqual([
      { tenantId_kind: { tenantId: 't1', kind: TrialNotificationKind.LAST_DAY } },
    ]);
  });

  it('日差 4 以上の候補は対象外として skipped に数える', async () => {
    const { service, sent } = buildService({
      candidates: [candidateRow({ currentPeriodEnd: jstEndOfDay('2026-08-27') })],
    });

    const result = await service.run(NOW);

    expect(result.skipped).toBe(1);
    expect(sent).toHaveLength(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm --filter @shipyard/api test -- src/jobs/trial-reminder.service.spec.ts`

Expected: FAIL。`TrialReminderService` が export されていない。

- [ ] **Step 3: 結果型とサービス本体を実装する**

`trial-reminder.service.ts` の import を差し替え、純関数の下にクラスを追加します。

```ts
import { Injectable, Logger } from '@nestjs/common';

import { isPrismaError, PrismaErrorCode, SubStatus, TrialNotificationKind } from '@shipyard/db';

import { dayjs, JST_OFFSET_HOURS } from '../common/time';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import type { Stripe } from '../stripe/stripe.types';
import { CANDIDATE_WINDOW_DAYS, THREE_DAYS_MAX_DIFF } from './jobs.constants';
```

```ts
/** バッチ 1 回分の処理結果(エンドポイントのレスポンスボディにそのまま使う)。 */
export interface TrialReminderResult {
  /** DB から抽出した候補件数 */
  processed: number;
  /** 実際に送信した件数 */
  sent: { threeDays: number; lastDay: number };
  /** 対象外・送信済み・判定不能で送らなかった件数 */
  skipped: number;
  /** 送信を試みて失敗した件数 */
  failed: number;
}

/**
 * トライアル終了通知の日次バッチ(F20、ADR-012 v1.x)。
 *
 * EventBridge Rule + API destination から `POST /internal/jobs/trial-reminders` 経由で
 * 毎日 03:00 UTC(12:00 JST)に起動される。
 *
 * **冪等性**:`TrialNotification` への予約 INSERT →(送信)→ 失敗時 DELETE の順で処理する
 * (`AIUsageService` のクレジット予約と同じパターン)。unique 制約が App Runner のスケール
 * 多重発火と EventBridge の 24 時間リトライの両方を吸収する。
 */
@Injectable()
export class TrialReminderService {
  private readonly logger = new Logger(TrialReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly mail: MailService,
  ) {}

  async run(now: Date = new Date()): Promise<TrialReminderResult> {
    const windowEnd = dayjs(now).add(CANDIDATE_WINDOW_DAYS, 'day').toDate();

    // 候補抽出。`status = TRIALING` を必ず併記する:currentPeriodEnd 単体では
    // 「トライアル終了日」か「次回請求日」かを区別できず、有料契約中のテナントを
    // 拾って誤った文面を送ってしまうため。
    const candidates = await this.prisma.subscription.findMany({
      where: {
        status: SubStatus.TRIALING,
        currentPeriodEnd: { gt: now, lte: windowEnd },
      },
      select: {
        stripeSubId: true,
        currentPeriodEnd: true,
        tenant: {
          select: { id: true, name: true, slug: true, owner: { select: { email: true } } },
        },
      },
    });

    const result: TrialReminderResult = {
      processed: candidates.length,
      sent: { threeDays: 0, lastDay: 0 },
      skipped: 0,
      failed: 0,
    };

    for (const candidate of candidates) {
      const trialEnd = candidate.currentPeriodEnd;
      if (!trialEnd || !candidate.stripeSubId) {
        result.skipped++;
        continue;
      }

      const kind = resolveNotificationKind(trialEnd, now);
      if (!kind) {
        result.skipped++;
        continue;
      }

      const tenant = candidate.tenant;

      // カード登録済みは終了時に課金開始へ遷移するため対象外。Stripe 参照が失敗した場合は
      // その日は送らず次回に回す(外部 API 障害で送信記録を汚さないため)。
      let stripeSub: Stripe.Subscription;
      try {
        stripeSub = await this.stripe.client.subscriptions.retrieve(candidate.stripeSubId, {
          expand: ['customer'],
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Failed to retrieve Stripe subscription for tenant ${tenant.id}: ${msg}`);
        result.skipped++;
        continue;
      }

      if (hasPaymentMethod(stripeSub)) {
        result.skipped++;
        continue;
      }

      // 予約 INSERT。unique 違反 = 送信済み or 他インスタンスが処理中。
      try {
        await this.prisma.trialNotification.create({ data: { tenantId: tenant.id, kind } });
      } catch (e) {
        if (isPrismaError(e, PrismaErrorCode.UNIQUE_VIOLATION)) {
          result.skipped++;
          continue;
        }
        throw e;
      }

      try {
        await this.mail.sendTrialReminder({
          to: tenant.owner.email,
          workspaceName: tenant.name,
          workspaceSlug: tenant.slug,
          daysLeft: daysLeftFor(trialEnd, now),
          trialEndsAt: trialEnd,
        });
        if (kind === TrialNotificationKind.LAST_DAY) result.sent.lastDay++;
        else result.sent.threeDays++;
      } catch (e) {
        // 送信に失敗したら予約を解放し、翌日リトライできる状態に戻す。
        await this.prisma.trialNotification
          .delete({ where: { tenantId_kind: { tenantId: tenant.id, kind } } })
          .catch(() => undefined);
        result.failed++;
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`Failed to send trial reminder to tenant ${tenant.id}: ${msg}`);
      }
    }

    // 「発火したが対象 0 件」と「発火しなかった」を区別できるよう、毎回必ず出力する。
    this.logger.log(`trial-reminders finished: ${JSON.stringify(result)}`);
    return result;
  }
}
```

`THREE_DAYS_MAX_DIFF` は純関数側で既に使われているため、import はそのまま維持されます。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm --filter @shipyard/api test -- src/jobs/trial-reminder.service.spec.ts`

Expected: PASS(19 件 = 純関数 14 + `run()` 5)。

- [ ] **Step 5: 型チェックを流す**

Run: `pnpm --filter @shipyard/api type-check`

Expected: エラーなし。

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/jobs/trial-reminder.service.ts apps/api/src/jobs/trial-reminder.service.spec.ts
git commit -m "feat(jobs): トライアル終了通知の日次バッチ本体を実装する

予約 INSERT → 送信 → 失敗時 DELETE で冪等性を担保する。個別の失敗では
止めず集計を返し、処理件数は毎回ログに出して沈黙故障と区別できるようにした。"
```

---

## Task 7: 内部ジョブエンドポイントを公開する

**Files:**

- Create: `apps/api/src/jobs/internal-job.guard.ts`
- Create: `apps/api/src/jobs/jobs.controller.ts`
- Create: `apps/api/src/jobs/jobs.module.ts`
- Modify: `apps/api/src/app.module.ts:58-70`

- [ ] **Step 1: Guard を実装する**

Create `apps/api/src/jobs/internal-job.guard.ts`:

```ts
import { createHash, timingSafeEqual } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { INTERNAL_JOB_TOKEN_HEADER } from './jobs.constants';

/**
 * 内部ジョブエンドポイント(`/internal/jobs/*`)の認証 Guard。
 *
 * EventBridge の API destination Connection は API_KEY 認証(ヘッダ名 + 値)しか扱えないため、
 * 共有シークレットをヘッダで受け取って検証する。
 *
 * **env 未設定でもアプリ起動は止めない**:`CLERK_WEBHOOK_SECRET` のプレースホルダで本番の
 * bootstrap ごと落ちた事故(webhooks.controller.ts のコメント参照)を踏まえ、
 * 「未設定ならこのエンドポイントだけ 500」に倒す。
 */
@Injectable()
export class InternalJobGuard implements CanActivate {
  private readonly logger = new Logger(InternalJobGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>('INTERNAL_JOB_TOKEN');
    if (!expected) {
      this.logger.error(
        'INTERNAL_JOB_TOKEN is not set; POST /internal/jobs/* will respond 500 until configured',
      );
      throw new InternalServerErrorException('Internal job endpoint is not configured');
    }

    const req = ctx.switchToHttp().getRequest<Request>();
    const provided = req.headers[INTERNAL_JOB_TOKEN_HEADER];
    if (typeof provided !== 'string' || !constantTimeEquals(provided, expected)) {
      throw new UnauthorizedException('Invalid internal job token');
    }
    return true;
  }
}

/**
 * タイミング攻撃に強い文字列比較。
 * `timingSafeEqual` は同一長のバッファを要求するため、いったん SHA-256 に通して長さを揃える
 * (長さの違いで早期 return すると、その分岐自体が情報を漏らすため)。
 */
function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
```

- [ ] **Step 2: Controller を実装する**

Create `apps/api/src/jobs/jobs.controller.ts`:

```ts
import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';

import { InternalJobGuard } from './internal-job.guard';
import { TrialReminderService, type TrialReminderResult } from './trial-reminder.service';

/**
 * 内部ジョブの受け口(F20 / 将来の F15 Reconciliation)。
 *
 * EventBridge Rule + API destination から日次で叩かれる。`TenantMiddleware` は
 * `X-Tenant-Slug` の無いリクエストを素通しするため、テナント無しで通過する(webhook と同じ経路)。
 */
@Controller('internal/jobs')
@UseGuards(InternalJobGuard)
export class JobsController {
  constructor(private readonly trialReminders: TrialReminderService) {}

  /**
   * トライアル終了通知バッチを実行する。
   *
   * **個別の送信が全件失敗しても 200 を返す**:500 を返すと EventBridge が最大 24 時間
   * リトライし、成功済みの分を再送するリスクを生むため。500 は DB 接続断など処理自体を
   * 開始できなかった場合(= 例外が Service から抜けてきた場合)に限られる。
   */
  @Post('trial-reminders')
  @HttpCode(200)
  async runTrialReminders(): Promise<TrialReminderResult> {
    return this.trialReminders.run();
  }
}
```

- [ ] **Step 3: Module を作る**

Create `apps/api/src/jobs/jobs.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { JobsController } from './jobs.controller';
import { TrialReminderService } from './trial-reminder.service';

/**
 * 内部ジョブ Module(F20 トライアル終了通知)。
 *
 * 依存する PrismaService / StripeService / MailService はいずれも `@Global()` Module から
 * 提供されるため、AppModule 直登録の provider には依存しない。したがって BlogPostModule と
 * 同じく独立 Module にしても DI スコープの二重化は起きない(AppModule のコメント参照)。
 */
@Module({
  controllers: [JobsController],
  providers: [TrialReminderService],
})
export class JobsModule {}
```

- [ ] **Step 4: AppModule に登録する**

`apps/api/src/app.module.ts` の import 文に追加します。

```ts
import { JobsModule } from './jobs/jobs.module';
```

`imports` 配列の `BlogPostModule` の下に追加します。

```ts
    BlogPostModule,
    // 内部ジョブ(F20 トライアル終了通知)。依存はすべて @Global Module 由来のため独立 Module でよい。
    JobsModule,
```

- [ ] **Step 5: 起動して 401 と 200 を確認する**

`apps/api/.env.local` に `INTERNAL_JOB_TOKEN=local-dev-token` を追記してから、別ターミナルで dev サーバを起動します。

Run:

```bash
pnpm dev:api
```

別ターミナルで:

```bash
curl -i -X POST http://localhost:4000/internal/jobs/trial-reminders
curl -i -X POST http://localhost:4000/internal/jobs/trial-reminders -H 'X-Internal-Job-Token: local-dev-token'
```

Expected: 1 本目は `401 Unauthorized`。2 本目は `200 OK` で `{"processed":0,"sent":{"threeDays":0,"lastDay":0},"skipped":0,"failed":0}`(ローカル DB にトライアル中テナントが無い場合)。API のログに `trial-reminders finished: {...}` が出る。

- [ ] **Step 6: 型チェックと lint を流す**

Run: `pnpm --filter @shipyard/api type-check && pnpm lint`

Expected: どちらもエラーなし。

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/jobs/internal-job.guard.ts apps/api/src/jobs/jobs.controller.ts apps/api/src/jobs/jobs.module.ts apps/api/src/app.module.ts
git commit -m "feat(jobs): 内部ジョブエンドポイントを追加する

EventBridge の API destination は API key 認証しか扱えないため、共有
シークレットをヘッダで受けて timing-safe に比較する。env 未設定でも起動は
止めず、このエンドポイントだけ 500 に倒す。"
```

---

## Task 8: 環境変数を 3 箇所に追加する

`implementation-rules.md` の env 追加ルールに従い、`.env.example` と `secrets.tf` と runbook を**同時に**更新します。

**Files:**

- Modify: `apps/api/.env.example`(末尾)
- Modify: `infra/prod/secrets.tf:12-25`
- Modify: `docs/runbooks/adr-012-release-checklist.md`(§2 のシークレット投入手順)

- [ ] **Step 1: .env.example に追記する**

末尾に追加します。

```bash
# -----------------------------------------------------------------------------
# 内部ジョブ(F20 トライアル終了通知、ADR-012 v1.x)
# -----------------------------------------------------------------------------
# `POST /internal/jobs/*` の共有シークレット。本番では EventBridge の API destination
# Connection に同じ値を設定する(infra/prod/scheduler.tf)。
# 生成例: openssl rand -hex 32
# 未設定の場合、内部ジョブエンドポイントは 500 を返す(アプリ起動は止めない)。
INTERNAL_JOB_TOKEN=local-dev-token
```

- [ ] **Step 2: secrets.tf のキー一覧に追加する**

`local.app_secret_keys` を 10 キーから 11 キーにします。

```hcl
    "RESEND_API_KEY",
    # 内部ジョブ(F20 トライアル終了通知)の共有シークレット。EventBridge の API destination
    # Connection(scheduler.tf)に設定する値と一致させること。不一致だと日次バッチが 401 で
    # 失敗し続ける(FailedInvocations アラームで検知される)。
    "INTERNAL_JOB_TOKEN",
```

- [ ] **Step 3: runbook に投入手順を追記する**

`docs/runbooks/adr-012-release-checklist.md` §2 のチェックリスト末尾(`CLERK_WEBHOOK_SECRET` の行の下)に追記します。

```markdown
- [ ] `INTERNAL_JOB_TOKEN` = `openssl rand -hex 32` で生成した 64 文字の hex(F20 内部ジョブの共有シークレット)
      **同じ値を EventBridge Connection(`shipyard-prod-internal-job`)の API key にも設定すること。**
      不一致だと日次バッチが 401 で失敗し続ける(`shipyard-prod-trial-reminders-failed` アラームで検知される)
```

同節末尾の「計 10 キー」を「**計 11 キー**」に修正します。

- [ ] **Step 4: terraform の構文を検証する**

Run:

```bash
terraform -chdir=infra/prod fmt -check && terraform -chdir=infra/prod validate
```

Expected: どちらもエラーなし。`validate` が init 未実行で失敗する場合は先に `terraform -chdir=infra/prod init -backend=false` を実行します。

- [ ] **Step 5: Commit**

```bash
git add apps/api/.env.example infra/prod/secrets.tf docs/runbooks/adr-012-release-checklist.md
git commit -m "chore: INTERNAL_JOB_TOKEN を env / secrets / runbook に追加する"
```

---

## Task 9: EventBridge の日次実行を terraform で定義する

EventBridge **Scheduler** は任意の HTTPS を直接ターゲットにできない(ターゲットは Lambda / SQS / SNS 等の AWS API のみ)ため、**Rule + API destination** を使います。

**Files:**

- Create: `infra/prod/scheduler.tf`
- Modify: `infra/prod/monitoring.tf`(末尾のアラーム群に追記)

- [ ] **Step 1: scheduler.tf を作る**

Create `infra/prod/scheduler.tf`:

```hcl
# -----------------------------------------------------------------------------
# 内部ジョブの日次実行(F20 トライアル終了通知、ADR-012 v1.x)
#
# EventBridge Scheduler は任意の HTTPS を直接ターゲットにできない(ターゲットは Lambda /
# SQS / SNS 等の AWS API のみ)ため、Rule + API destination の構成を採る。
# 将来 F15 Reconciliation バッチを足すときは、rule / target / api_destination を
# 1 組追加するだけでよい(connection と IAM ロールは共用できる)。
# -----------------------------------------------------------------------------

# API key 認証。値は Secrets Manager の INTERNAL_JOB_TOKEN と一致させる(手動投入)。
resource "aws_cloudwatch_event_connection" "internal_job" {
  name               = "${local.name_prefix}-internal-job"
  description        = "Neorie API の内部ジョブエンドポイント認証"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key = "X-Internal-Job-Token"
      # 実値はコンソール / CLI で手動投入する。terraform state に平文を残さないため
      # プレースホルダで作成し、以降の差分は無視する。
      value = "REPLACE_ME"
    }
  }

  lifecycle {
    ignore_changes = [auth_parameters]
  }
}

resource "aws_cloudwatch_event_api_destination" "trial_reminders" {
  name                             = "${local.name_prefix}-trial-reminders"
  description                      = "トライアル終了通知バッチの起動先"
  invocation_endpoint              = "https://api.${var.domain_name}/internal/jobs/trial-reminders"
  http_method                      = "POST"
  invocation_rate_limit_per_second = 1
  connection_arn                   = aws_cloudwatch_event_connection.internal_job.arn
}

resource "aws_cloudwatch_event_rule" "trial_reminders_daily" {
  name                = "${local.name_prefix}-trial-reminders-daily"
  description         = "毎日 03:00 UTC(12:00 JST)にトライアル終了通知バッチを起動する"
  schedule_expression = "cron(0 3 * * ? *)"
}

resource "aws_cloudwatch_event_target" "trial_reminders" {
  rule     = aws_cloudwatch_event_rule.trial_reminders_daily.name
  arn      = aws_cloudwatch_event_api_destination.trial_reminders.arn
  role_arn = aws_iam_role.eventbridge_invoke_api.arn
}

# --- EventBridge が API destination を叩くための実行ロール ---

data "aws_iam_policy_document" "eventbridge_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eventbridge_invoke_api" {
  name               = "${local.name_prefix}-eventbridge-invoke-api"
  assume_role_policy = data.aws_iam_policy_document.eventbridge_assume.json
}

data "aws_iam_policy_document" "eventbridge_invoke_api" {
  statement {
    actions   = ["events:InvokeApiDestination"]
    resources = [aws_cloudwatch_event_api_destination.trial_reminders.arn]
  }
}

resource "aws_iam_role_policy" "eventbridge_invoke_api" {
  name   = "${local.name_prefix}-eventbridge-invoke-api"
  role   = aws_iam_role.eventbridge_invoke_api.id
  policy = data.aws_iam_policy_document.eventbridge_invoke_api.json
}
```

- [ ] **Step 2: 失敗検知アラームを追加する**

`infra/prod/monitoring.tf` の App Runner アラームの下に追記します。

```hcl
# --- 内部ジョブの起動失敗アラーム(F20)---

resource "aws_cloudwatch_metric_alarm" "trial_reminders_failed" {
  alarm_name          = "${local.name_prefix}-trial-reminders-failed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FailedInvocations"
  namespace           = "AWS/Events"
  period              = 86400
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "トライアル終了通知バッチの起動に失敗した(F20)"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    RuleName = aws_cloudwatch_event_rule.trial_reminders_daily.name
  }
}
```

- [ ] **Step 3: 構文検証と plan を確認する**

Run:

```bash
terraform -chdir=infra/prod fmt -check
terraform -chdir=infra/prod validate
terraform -chdir=infra/prod plan
```

Expected: `fmt` / `validate` がエラーなし。`plan` が新規 7 リソース(connection / api_destination / rule / target / iam_role / iam_role_policy / metric_alarm)の追加を示し、既存リソースの破棄・置換が **0 件**であること。

- [ ] **Step 4: Commit**

```bash
git add infra/prod/scheduler.tf infra/prod/monitoring.tf
git commit -m "feat(infra): トライアル終了通知の日次実行を EventBridge で定義する

Scheduler は任意の HTTPS を直接叩けないため Rule + API destination を使う。
FailedInvocations のアラームを既存 SNS に繋ぎ、沈黙故障を検知できるようにした。"
```

---

## Task 10: 本番へ反映して疎通を確認する

このタスクだけはコード変更を伴わず、実環境での操作になります。

**Files:** なし(運用手順)

- [ ] **Step 1: シークレットを投入する**

トークンを生成し、**Secrets Manager と EventBridge Connection の両方に同じ値**を入れます。

`put-secret-value` は JSON 全体を置換するため、既存キーを消さないよう現在値を取得して `jq` でマージします(`production-cutover.md` の `CLERK_WEBHOOK_SECRET` 投入と同じ手順)。

```bash
TOKEN=$(openssl rand -hex 32)
SECRET_ARN=$(aws secretsmanager list-secrets \
  --query "SecretList[?starts_with(Name, 'shipyard-prod-app-config')].ARN | [0]" --output text)

CURRENT=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)
UPDATED=$(printf '%s' "$CURRENT" | jq --arg v "$TOKEN" '.INTERNAL_JOB_TOKEN = $v')
aws secretsmanager put-secret-value --secret-id "$SECRET_ARN" --secret-string "$UPDATED"
```

EventBridge Connection 側にも同じ値を入れます。

```bash
aws events update-connection \
  --name shipyard-prod-internal-job \
  --authorization-type API_KEY \
  --auth-parameters "ApiKeyAuthParameters={ApiKeyName=X-Internal-Job-Token,ApiKeyValue=$TOKEN}"
```

シークレットは **App Runner の起動時にのみ解決される**ため、値を入れただけでは反映されません。Step 3 の再デプロイが必須です。

- [ ] **Step 2: terraform を適用する**

Run: `terraform -chdir=infra/prod apply`

Expected: 7 リソースが作成される。既存リソースの変更は `secrets.tf` のキー追加に伴うもののみで、App Runner サービスの置換が起きないこと。

- [ ] **Step 3: API を再デプロイする**

`INTERNAL_JOB_TOKEN` を App Runner のランタイムシークレットとして読み込ませるため、GitHub Actions のデプロイワークフローを実行します。App Runner の `UpdateService` は SourceConfiguration を**マージではなく置換**するため、既存の env / secrets が落ちていないことをデプロイ後に確認します。

- [ ] **Step 4: エンドポイントの疎通を確認する**

```bash
curl -i -X POST https://api.neorie.com/internal/jobs/trial-reminders
curl -i -X POST https://api.neorie.com/internal/jobs/trial-reminders -H "X-Internal-Job-Token: $TOKEN"
```

Expected: 1 本目 `401`、2 本目 `200` で集計 JSON が返る。

- [ ] **Step 5: EventBridge からの発火を確認する**

AWS コンソールで rule の `schedule_expression` を一時的に `rate(5 minutes)` に変更し、5 分待って以下を確認します。確認後は `cron(0 3 * * ? *)` に戻します(terraform 管理下なので、コンソールで変えた場合は `terraform apply` で戻すこと)。

- CloudWatch Logs に `trial-reminders finished: {...}` が出ていること
- rule のメトリクス `Invocations` が 1 以上、`FailedInvocations` が 0 であること

- [ ] **Step 6: 動作確認の結果を PROJECT_STATUS に記録する**

`docs/PROJECT_STATUS.md` の変更履歴に、投入したトークンの所在(Secrets Manager / EventBridge Connection の 2 箇所)と疎通確認の結果を 1 行で残します。

---

## Task 11: ドキュメントを更新する

**Files:**

- Modify: `docs/adr/012-plan-structure-revision.md`
- Modify: `docs/PROJECT_STATUS.md`

- [ ] **Step 1: ADR-012 の v1.x 節を更新する**

`docs/adr/012-plan-structure-revision.md` の「#### v1.x(公開後 1〜3 ヶ月)」の該当行を差し替えます。

```markdown
- ~~**トライアル終了通知メール**(3 日前、当日)~~ → **✅ 2026-08-23 実装完了**(F20)。
  EventBridge Rule + API destination による日次バッチ。設計は
  [`../superpowers/specs/2026-08-23-f20-trial-reminder-email-design.md`](../superpowers/specs/2026-08-23-f20-trial-reminder-email-design.md)
```

- [ ] **Step 2: ADR-012 のプラン表に注記を足す**

同ファイルのプラン表(「新規登録(トライアル)」の行)の直下に注記を追加します。

```markdown
> **トライアル期間の実態は「7 日 + 当日の残り」です(2026-08-23、F20 に伴う変更)。** 当初は Stripe の
> `trial_period_days: 7` を使っていましたが、終了時刻がテナント作成時刻に依存してバラバラになり、
> 12:00 JST 固定の通知バッチから「終了当日」を判定できませんでした。`trial_end` を明示的に渡して
> **JST の日末(23:59:59)** に揃えたため、ユーザー間で最大 24 時間の差が出ます。原価は AI クレジット
> 300cr が上限のため青天井にはなりません。
```

- [ ] **Step 3: PROJECT_STATUS を更新する**

§9.12.2 の「v1.x 送りフォローアップ完全リスト」の F20 行を差し替えます。

```markdown
| F20 | ~~トライアル終了 7 日 / 3 日 / 当日 通知メール~~ → **✅ 2026-08-23 実装完了**(3 日前 + 当日の 2 通。7 日前は開始当日にあたり成立しないため 2 通に確定) | ADR-012 |
```

変更履歴の末尾に 1 行追加します。

```markdown
| 2026-08-23 | **F20 トライアル終了通知メールを実装**。ADR-012 の KPI「トライアル → Pro 転換率 ≥ 10%」に直結する穴(7 日後に予告なく AI 機能が停止する)を塞いだ。**(1) 発火方式は EventBridge Rule + API destination**:App Runner はアイドル時に CPU を絞るためアプリ内 cron は定刻発火が保証されず、既定 Auto Scaling(最大 25 インスタンス)では多重発火する。加えて 2026-08-15 の Stripe Webhook 障害(9 日間サイレントに停止)と同じ壊れ方を避けるため、`FailedInvocations` を CloudWatch アラーム経由で既存 SNS に繋げる方式を選んだ。増分コストは Connection が作る Secrets Manager シークレット 1 本の月 $0.40。**(2) 冪等性**は `TrialNotification` の `(tenantId, kind)` unique 制約 + 予約 INSERT → 送信 → 失敗時 DELETE(`AIUsageService` のクレジット予約と同パターン)。**(3) `trial_period_days` → `trial_end` へ変更**しトライアル終了時刻を JST 日末に揃えた。終了時刻が作成時刻依存だと 12:00 JST 固定のバッチから「当日」を判定できないため。副作用として実質 7〜8 日弱になる。**(4) カード登録済みは対象外**(終了時に解約ではなく課金開始へ遷移するため文面と食い違う)。Subscription 側と Customer 側の両方の既定 PM を見る。**(5) 調査で判明した前提の誤り 2 件**:`Subscription.trialEndsAt` は存在せず `currentPeriodEnd` が兼務していること、7 日トライアルに対する「7 日前通知」は開始当日にあたり成立しないこと。**F15 Reconciliation バッチは `jobs/` モジュールに service を 1 つ、terraform に rule を 1 組足すだけで乗る。** |
```

- [ ] **Step 4: Commit**

```bash
git add docs/adr/012-plan-structure-revision.md docs/PROJECT_STATUS.md
git commit -m "docs: F20 トライアル終了通知メールの実装を記録する"
```

---

## 実装後に残る既知の課題

実装中に見つけた、本計画のスコープ外の事項です。着手せず記録だけ残します。

| 項目                                                                                                                                                                                  | 対応                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `MailService.sendInvitation` の `expiresAtLabel` は `dayjs(date).format(...)` でサーバのローカルタイムゾーンに依存します。App Runner が UTC なら招待メールの期限表記が 9 時間ずれます | 別タスクで `.utcOffset(9)` に揃える |
| 送信成功後・DELETE 判定前にプロセスが落ちた場合、翌日に 1 回だけ重複送信される可能性があります                                                                                        | spec §5 で許容と判断済み            |
| トライアル終了**後**のフォロー(復帰導線)メールは未実装です                                                                                                                            | 必要になったら別 F# として起票      |
