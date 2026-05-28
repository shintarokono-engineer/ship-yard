# マルチチャネル告知配信 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ユーザーのリリース告知 / アップデート告知を、Shipyard 内から Twitter(OAuth + API)+ 自前ブログ(`/p/{slug}/{projectId}/blog/{postSlug}` で公開)に一斉配信できる MVP を実装する。メール配信は v1.x 送り。

**Architecture:** Project 配下に `Announcement` entity(複数)+ `Delivery` entity(channel ごと、`@@unique([announcementId, channel])`)。Sonnet 4 + Tool Use(`submit_announcement_drafts`)で Twitter 文 + Blog 本文を一括生成、`ANNOUNCEMENT_GEN` Feature で AIUsage 計上。Twitter は OAuth 2.0 PKCE で個人アカウント連携、token は AES-256-GCM 暗号化。Blog は ADR-009 LP の「アプリ内編集 + 公開 URL」 パターンを流用。

**Tech Stack:** NestJS 11 + Prisma 6(PostgreSQL 16)/ Next.js 15 App Router + React 19 + Tailwind v4 + shadcn/ui / Anthropic SDK(Sonnet 4)/ Upstash Redis(OAuth state)/ AWS Secrets Manager(token 暗号化 master key)/ Twitter API v2 + OAuth 2.0 PKCE

**Spec doc:** `docs/superpowers/specs/2026-05-28-multi-channel-publishing-design.md`
**ADR:** `docs/adr/014-multi-channel-announcement.md`

---

## File Structure

### 新規作成

**packages/db**

- `packages/db/prisma/schema.prisma` の編集:`Announcement` / `Delivery` / `BlogPost` / `TwitterAccount` model + 3 enum 追加、`Tenant` / `Project` / `User` に back-relation 追加、`Feature` enum に `ANNOUNCEMENT_GEN` 追加
- `packages/db/prisma/migrations/{ts}_add_announcement_delivery_blogpost_twitteraccount/migration.sql` 新規(4 model + 3 enum、手作業整理で HNSW DROP / 無関係 FK 付替を除去)
- `packages/db/prisma/migrations/{ts}_add_feature_announcement_gen/migration.sql` 新規(`ALTER TYPE "Feature" ADD VALUE 'ANNOUNCEMENT_GEN'` の単独 migration、Day 14/27/43/49 と同パターン)

**apps/api**

- `apps/api/src/common/crypto/token-encryption.service.ts` 新規(AES-256-GCM)
- `apps/api/src/common/crypto/token-encryption.spec.ts` 新規(単体テスト)
- `apps/api/src/common/crypto/crypto.module.ts` 新規(Global Module、`TokenEncryptionService` を export)
- `apps/api/src/announcements/announcement.constants.ts` 新規(`ANNOUNCEMENT_GEN_MAX_TOKENS=3072`、`ANNOUNCEMENT_GEN_TEMPERATURE=0.7`、`ANNOUNCEMENT_MAX_PER_MONTH_PRO=50`、`TWITTER_TEXT_MAX=280`、`BLOG_TITLE_MAX=120` 等)
- `apps/api/src/announcements/announcement-types.ts` 新規(`AnnouncementDrafts` / `TwitterDeliveryContent` / `BlogDeliveryContent` の TS 型)
- `apps/api/src/announcements/announcement-tool.ts` 新規(`SUBMIT_ANNOUNCEMENT_DRAFTS_TOOL` = Tool Use input_schema)
- `apps/api/src/announcements/announcement-gen.service.ts` 新規(Sonnet 4 + Tool Use)
- `apps/api/src/announcements/announcement.service.ts` 新規(CRUD + executeDelivery dispatcher)
- `apps/api/src/announcements/announcement.controller.ts` 新規(7 endpoints)
- `apps/api/src/announcements/announcement.module.ts` 新規
- `apps/api/src/announcements/dto/create-announcement.dto.ts` 新規
- `apps/api/src/announcements/dto/update-announcement.dto.ts` 新規
- `apps/api/src/announcements/dto/generate-announcement.dto.ts` 新規
- `apps/api/src/integrations/twitter/twitter.constants.ts` 新規(`TWITTER_AUTH_STATE_TTL_SECONDS=300`、`TWITTER_SCOPES=['tweet.read', 'tweet.write', 'users.read', 'offline.access']`)
- `apps/api/src/integrations/twitter/twitter-auth.service.ts` 新規(OAuth state + PKCE + Redis)
- `apps/api/src/integrations/twitter/twitter-client.service.ts` 新規(token refresh + postTweet + revoke)
- `apps/api/src/integrations/twitter/integrations-twitter.controller.ts` 新規(4 endpoints)
- `apps/api/src/integrations/twitter/integrations-twitter.module.ts` 新規
- `apps/api/src/blog-posts/blog-post.service.ts` 新規
- `apps/api/src/blog-posts/blog-post.controller.ts` 新規(認証付き 3 endpoints)
- `apps/api/src/blog-posts/blog-post-public.controller.ts` 新規(未認証 1 endpoint)
- `apps/api/src/blog-posts/blog-post.module.ts` 新規
- `apps/api/src/blog-posts/dto/update-blog-post.dto.ts` 新規

**apps/web**

- `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/page.tsx` 新規(一覧 Server Component)
- `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/[id]/page.tsx` 新規(編集ページ Server Component)
- `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_shared/announcement-form.ts` 新規(定数 + validation ヘルパー)
- `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_actions/announcements.ts` 新規(Server Action)
- `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_components/new-announcement-dialog.tsx` 新規
- `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_components/announcement-generate-dialog.tsx` 新規
- `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_components/twitter-content-editor.tsx` 新規
- `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_components/blog-content-editor.tsx` 新規
- `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_components/delivery-execute-button.tsx` 新規
- `apps/web/src/app/w/[slug]/settings/integrations/page.tsx` 新規
- `apps/web/src/app/p/[slug]/[projectId]/blog/[postSlug]/page.tsx` 新規(公開ブログページ Server Component)
- `apps/web/src/app/p/[slug]/[projectId]/blog/[postSlug]/error.tsx` 新規(エラーバウンダリ、LP 公開ページと同パターン)

**docs**

- `docs/runbooks/twitter-integration-troubleshooting.md` 新規(Day 49 Clerk webhook runbook と同形式)

### 編集

- `apps/api/src/ai/ai.constants.ts`:`ANNOUNCEMENT_GEN_*` 定数追加(直接定数群を入れる場所として既存)
- `apps/api/src/ai/ai-usage.service.ts`:`assertWithinAnnouncementQuota` メソッド追加(`assertWithinDiagnosisQuota` と同パターン)
- `apps/api/src/app.module.ts`:`CryptoModule` / `AnnouncementModule` / `IntegrationsTwitterModule` / `BlogPostModule` 登録
- `apps/api/.env.example`:`TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` / `TWITTER_REDIRECT_URI` / `TWITTER_TOKEN_ENCRYPTION_KEY` 追加
- `apps/api/package.json`:`@upstash/redis` 依存追加(既に Upstash 既存なら confirm、無ければ追加)
- `apps/web/src/lib/api/types.ts`:Announcement / Delivery / BlogPost / TwitterAccount 関連型追加(`DeliveryChannel` / `DeliveryStatus` / `AnnouncementStatus` enum と TS 型)
- `apps/web/src/lib/api/workspaces.ts`:API 関数追加(`createAnnouncement` / `listAnnouncements` / `fetchAnnouncement` / `updateAnnouncement` / `deleteAnnouncement` / `generateAnnouncement` / `executeDelivery` / `listTwitterAccounts` / `disconnectTwitterAccount` / `fetchPublicBlogPost` / `updateBlogPost`)
- `apps/web/src/app/w/[slug]/projects/[projectId]/page.tsx`:Project 詳細の Card グリッドに「告知配信」 Card 追加
- `apps/web/src/app/w/[slug]/settings/layout.tsx`(or 等価のタブナビ実装ファイル):`integrations` タブ追加
- `apps/web/src/middleware.ts`:`/p/(.*)` は既に publicRoutes 済(LP 公開と共通)、追加変更不要 — Read で確認のみ
- `apps/web/src/app/robots.ts`(無ければ新規):`/p/*` allow + `/w/*` Disallow
- `apps/web/src/app/sitemap.ts`(無ければ新規):公開済 BlogPost を含める

---

## Day 56:BE 基盤 + データモデル

### Task 1: Prisma schema に 4 model + 3 enum + back-relation を追加

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: schema.prisma に enum を 3 つ追加**

`packages/db/prisma/schema.prisma` の enum セクション末尾に追加:

```prisma
/// 告知配信の状態(ADR-014)。DRAFT(AI 生成前 / Delivery 0 件)→ READY(AI 生成済 / 未実行)
/// → EXECUTING(1 つ以上実行中 or 失敗あり)→ DONE(すべて SENT)
enum AnnouncementStatus {
  DRAFT
  READY
  EXECUTING
  DONE
}

/// Delivery のチャネル種別(ADR-014)。MVP では TWITTER / BLOG のみ、v1.x で EMAIL 追加予定。
enum DeliveryChannel {
  TWITTER
  BLOG
}

/// Delivery の実行状態(ADR-014)。DRAFT(content 未確定)→ SCHEDULED(予約済、MVP では未使用、v1.x BullMQ で実装)
/// → SENT(成功)/ FAILED(失敗、error にユーザー向け文言)
enum DeliveryStatus {
  DRAFT
  SCHEDULED
  SENT
  FAILED
}
```

- [ ] **Step 2: schema.prisma に Announcement model を追加**

enum の後、model セクションに追加:

```prisma
/// 1 つの告知トピック(ADR-014)。Project 配下に複数件持てる。
model Announcement {
  /// 内部 ID
  id            String   @id @default(cuid())
  /// 所属テナント(マルチテナント分離キー、必須)
  tenantId      String
  /// 所属プロジェクト
  projectId     String
  /// 内部管理用タイトル(配信文面とは別)
  title         String
  /// 告知の状態(DRAFT / READY / EXECUTING / DONE)
  status        AnnouncementStatus @default(DRAFT)
  /// 作成者(`TenantMember.userId`)
  createdById   String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  tenant     Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  project    Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdBy  User       @relation(fields: [createdById], references: [id])
  deliveries Delivery[]

  @@index([tenantId, projectId])
}
```

- [ ] **Step 3: schema.prisma に Delivery model を追加**

```prisma
/// チャネル別配信(ADR-014)。1 Announcement × 1 channel = 1 Delivery(@@unique で重複防止)。
/// content は Json でチャネル別ペイロードを保持(v1.x で EMAIL 追加時にスキーマ変更不要)。
model Delivery {
  /// 内部 ID
  id              String           @id @default(cuid())
  /// 所属テナント(マルチテナント分離キー、必須)
  tenantId        String
  /// 紐付く Announcement
  announcementId  String
  /// チャネル種別(TWITTER / BLOG)
  channel         DeliveryChannel
  /// 実行状態
  status          DeliveryStatus   @default(DRAFT)
  /// チャネル別ペイロード:
  /// - TWITTER: { text: string }(280 字、BE + FE で二重バリデーション)
  /// - BLOG: { blogPostId: string, summary: string }(BlogPost を別 entity に切り出し)
  content         Json
  /// 予約実行時刻(MVP では未使用、v1.x BullMQ)
  scheduledAt     DateTime?
  /// 実行成功時刻
  sentAt          DateTime?
  /// 実行者(execute API を叩いた人、監査用)
  executedById    String?
  /// 外部参照:TWITTER = tweet id / BLOG = BlogPost.id
  externalRef     String?
  /// 失敗時のユーザー向け日本語メッセージ(原文 Twitter API response は CloudWatch Logs に残す)
  error           String?

  tenant       Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  announcement Announcement @relation(fields: [announcementId], references: [id], onDelete: Cascade)
  executedBy   User?        @relation(fields: [executedById], references: [id])

  @@unique([announcementId, channel])
  @@index([tenantId, status])
}
```

- [ ] **Step 4: schema.prisma に BlogPost model を追加**

```prisma
/// 自前ブログの記事(ADR-014)。LP と同じ「アプリ内編集 + 公開 URL」 パターン(ADR-009)を踏襲。
/// Delivery 経由で publish された記事は deliveryId で紐付く。Delivery 削除時は SetNull で残置 = 公開 URL は維持。
model BlogPost {
  /// 内部 ID
  id            String   @id @default(cuid())
  /// 所属テナント(マルチテナント分離キー、必須)
  tenantId      String
  /// 所属プロジェクト
  projectId     String
  /// URL 用 slug(kebab-case)
  slug          String
  /// 記事タイトル
  title         String
  /// Markdown 本文
  body          String
  /// 公開日時(null = 下書き)
  publishedAt   DateTime?
  /// 紐付く Delivery(Announcement 経由で作られた場合のみ)
  deliveryId    String?  @unique
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  project  Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  delivery Delivery? @relation(fields: [deliveryId], references: [id], onDelete: SetNull)

  @@unique([tenantId, projectId, slug])
  @@index([tenantId, projectId, publishedAt])
}
```

- [ ] **Step 5: schema.prisma に TwitterAccount model を追加**

```prisma
/// Twitter (X) アカウント連携情報(ADR-014)。テナント単位で複数アカウント連携を許容。
/// accessToken / refreshToken はアプリ層 AES-256-GCM で暗号化してから保存(`iv||tag||ciphertext` の base64url)。
/// master key は AWS Secrets Manager 管理(env `TWITTER_TOKEN_ENCRYPTION_KEY`)。
model TwitterAccount {
  /// 内部 ID
  id              String   @id @default(cuid())
  /// 所属テナント(マルチテナント分離キー、必須)
  tenantId        String
  /// 連携実行者(`TenantMember.userId`、監査用、配信実行権限とは独立)
  connectedById   String
  /// X 側 user id
  xUserId         String
  /// @handle(表示用)
  handle          String
  /// 暗号化済 access_token(base64url(iv||tag||ciphertext))
  accessToken     String
  /// 暗号化済 refresh_token
  refreshToken    String
  /// access_token の有効期限
  expiresAt       DateTime
  /// 付与された scope(tweet.read / tweet.write / users.read / offline.access)
  scopes          String[]
  createdAt       DateTime @default(now())

  tenant      Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  connectedBy User   @relation(fields: [connectedById], references: [id])

  @@unique([tenantId, xUserId])
  @@index([tenantId])
}
```

- [ ] **Step 6: Tenant / Project / User に back-relation を追加**

`Tenant` model 内に追加:

```prisma
  announcements    Announcement[]
  deliveries       Delivery[]
  blogPosts        BlogPost[]
  twitterAccounts  TwitterAccount[]
```

`Project` model 内に追加:

```prisma
  announcements Announcement[]
  blogPosts     BlogPost[]
```

`User` model 内に追加:

```prisma
  announcementsCreated      Announcement[]
  deliveriesExecuted        Delivery[]
  twitterAccountsConnected  TwitterAccount[]
```

- [ ] **Step 7: prisma format で整形**

Run: `pnpm --filter @shipyard/db exec prisma format`
Expected: schema.prisma が整形されエラーなし。

- [ ] **Step 8: コミット**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): Announcement / Delivery / BlogPost / TwitterAccount + 3 enum 追加(ADR-014 Day 56)"
```

---

### Task 2: Migration を生成 + 手作業整理 + DB 適用

**Files:**
- Create: `packages/db/prisma/migrations/{ts}_add_announcement_delivery_blogpost_twitteraccount/migration.sql`

- [ ] **Step 1: --create-only で migration 生成**

Run: `pnpm --filter @shipyard/db exec prisma migrate dev --create-only --name add_announcement_delivery_blogpost_twitteraccount`
Expected: `packages/db/prisma/migrations/{ts}_add_..../migration.sql` が生成される(DB 適用はまだ)。

- [ ] **Step 2: 生成された migration.sql を手作業で整理**

開く:`packages/db/prisma/migrations/{ts}_add_..../migration.sql`

以下を除去(Day 14 / 27 / 43 / 49 と同パターン、`docs/PROJECT_STATUS.md` の Day 28 運用メモ参照):

- `DROP INDEX "ProjectDocument_embedding_hnsw_idx"` 行(HNSW は schema.prisma に表現できないため毎回 drop されようとする)
- 無関係な model の `DropForeignKey` + `AddForeignKey` 付替(Day 49 で混入した `IdeaValidation_createdById_fkey` 等の付替を再び見たら除去)

残すべきは:`CREATE TYPE` 3 つ(3 enum)+ `CREATE TABLE` 4 つ + `CREATE INDEX` + `CREATE UNIQUE INDEX` + `ALTER TABLE ... ADD CONSTRAINT` 関連のみ。

- [ ] **Step 3: 整理済 migration を DB に適用**

Run: `pnpm --filter @shipyard/db exec prisma migrate dev`
Expected: 「Applied migration `{ts}_add_announcement_delivery_blogpost_twitteraccount`」 と表示、エラーなし。Prisma Studio が動いていれば再起動を促す。

- [ ] **Step 4: 適用結果を psql で確認**

Run: `docker compose exec postgres psql -U shipyard -d shipyard -c "\d \"Announcement\""`
Expected: テーブル定義 + tenantId / projectId / status のカラムが表示される。同様に `\d "Delivery"` / `\d "BlogPost"` / `\d "TwitterAccount"` を確認。

- [ ] **Step 5: Prisma Client 再生成**

Run: `pnpm --filter @shipyard/db exec prisma generate`
Expected: 「Generated Prisma Client」 表示。

- [ ] **Step 6: @shipyard/db build**

Run: `pnpm --filter @shipyard/db build`
Expected: エラーなし。

- [ ] **Step 7: コミット**

```bash
git add packages/db/prisma/migrations/
git commit -m "feat(db): migration add_announcement_delivery_blogpost_twitteraccount(ADR-014 Day 56)"
```

---

### Task 3: Feature enum に ANNOUNCEMENT_GEN を追加

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/{ts}_add_feature_announcement_gen/migration.sql`

- [ ] **Step 1: schema.prisma の Feature enum に追加**

```prisma
enum Feature {
  // ... 既存の値 ...
  ANNOUNCEMENT_GEN  // ADR-014: マルチチャネル告知配信の文面生成(Sonnet 4 + Tool Use、Twitter + Blog を一括)
}
```

- [ ] **Step 2: --create-only で migration 生成**

Run: `pnpm --filter @shipyard/db exec prisma migrate dev --create-only --name add_feature_announcement_gen`
Expected: 新しい migration ファイルが生成される。

- [ ] **Step 3: migration.sql を「ALTER TYPE ADD VALUE 単独」 に整理**

開いて以下のみを残す(Day 14 REFINE_DOC 追加時と同パターン):

```sql
-- AlterEnum
ALTER TYPE "Feature" ADD VALUE 'ANNOUNCEMENT_GEN';
```

他に余計な行があれば全削除。

- [ ] **Step 4: DB 適用**

Run: `pnpm --filter @shipyard/db exec prisma migrate dev`
Expected: 適用成功。

- [ ] **Step 5: enum 値を psql で確認**

Run: `docker compose exec postgres psql -U shipyard -d shipyard -c "SELECT unnest(enum_range(NULL::\"Feature\"))"`
Expected: 既存値 + `ANNOUNCEMENT_GEN` が表示される。

- [ ] **Step 6: Prisma Client 再生成 + build**

Run: `pnpm --filter @shipyard/db exec prisma generate && pnpm --filter @shipyard/db build`
Expected: エラーなし。

- [ ] **Step 7: コミット**

```bash
git add packages/db/prisma/
git commit -m "feat(db): Feature.ANNOUNCEMENT_GEN 追加(ADR-014 Day 56)"
```

---

### Task 4: TokenEncryptionService 実装(AES-256-GCM)+ 単体テスト

**Files:**
- Create: `apps/api/src/common/crypto/token-encryption.service.ts`
- Create: `apps/api/src/common/crypto/token-encryption.spec.ts`
- Create: `apps/api/src/common/crypto/crypto.module.ts`

- [ ] **Step 1: 失敗するテストを書く**

`apps/api/src/common/crypto/token-encryption.spec.ts`:

```typescript
import { ConfigService } from '@nestjs/config';

import { TokenEncryptionService } from './token-encryption.service';

describe('TokenEncryptionService', () => {
  let service: TokenEncryptionService;

  beforeEach(() => {
    const masterKeyBase64 = Buffer.alloc(32, 1).toString('base64'); // 0x01 を 32 個
    const config = {
      getOrThrow: jest.fn().mockReturnValue(masterKeyBase64),
    } as unknown as ConfigService;
    service = new TokenEncryptionService(config);
  });

  it('encrypt → decrypt の往復で元の平文に戻る', () => {
    const plaintext = 'test-access-token-abc';
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('同じ平文でも IV がランダムで結果が毎回違う', () => {
    const plaintext = 'same-input';
    const enc1 = service.encrypt(plaintext);
    const enc2 = service.encrypt(plaintext);
    expect(enc1).not.toBe(enc2);
  });

  it('改ざんされた暗号文を decrypt すると例外', () => {
    const encrypted = service.encrypt('payload');
    const tampered = encrypted.slice(0, -2) + 'AA';
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('master key が 32 バイトでなければ constructor で例外', () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue(Buffer.alloc(16).toString('base64')),
    } as unknown as ConfigService;
    expect(() => new TokenEncryptionService(config)).toThrow(
      'TWITTER_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)',
    );
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pnpm --filter @shipyard/api test -- token-encryption.spec`
Expected: FAIL(`TokenEncryptionService` not found)

- [ ] **Step 3: TokenEncryptionService を実装**

`apps/api/src/common/crypto/token-encryption.service.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推奨 96bit
const TAG_LENGTH = 16; // GCM 認証タグ 128bit

/**
 * Twitter access_token / refresh_token を AES-256-GCM で暗号化・復号する(ADR-014)。
 *
 * 暗号化結果のフォーマット:base64url(iv || tag || ciphertext)
 * - 先頭 12B = IV(`randomBytes` で毎回ランダム)
 * - 次 16B = 認証タグ(GCM)
 * - 残り = 暗号文
 *
 * master key の運用は env `TWITTER_TOKEN_ENCRYPTION_KEY`(base64-encoded 32 バイト)。
 * - local:`apps/api/.env.local`(`.gitignore` 済)
 * - staging / prod:AWS Secrets Manager 経由で env 注入
 *
 * 鍵ローテーション(v1.x):新 key で再暗号化バッチを実装予定。
 */
@Injectable()
export class TokenEncryptionService {
  private readonly masterKey: Buffer;

  constructor(configService: ConfigService) {
    const keyBase64 = configService.getOrThrow<string>('TWITTER_TOKEN_ENCRYPTION_KEY');
    this.masterKey = Buffer.from(keyBase64, 'base64');
    if (this.masterKey.length !== 32) {
      throw new Error('TWITTER_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
  }

  decrypt(encrypted: string): string {
    const buf = Buffer.from(encrypted, 'base64url');
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
```

- [ ] **Step 4: CryptoModule を作成**

`apps/api/src/common/crypto/crypto.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';

import { TokenEncryptionService } from './token-encryption.service';

/** Global Module(他モジュールから import 不要で `TokenEncryptionService` を DI 可能)。 */
@Global()
@Module({
  providers: [TokenEncryptionService],
  exports: [TokenEncryptionService],
})
export class CryptoModule {}
```

- [ ] **Step 5: テストを実行して PASS を確認**

Run: `pnpm --filter @shipyard/api test -- token-encryption.spec`
Expected: PASS、4 test all green。

- [ ] **Step 6: app.module.ts に CryptoModule を登録**

`apps/api/src/app.module.ts` の `imports` 配列に `CryptoModule` を追加(import 文も)。

- [ ] **Step 7: .env.example に env を追加**

`apps/api/.env.example` に追加:

```bash
# Twitter token 暗号化用 master key(base64-encoded 32 bytes)
# 生成: openssl rand -base64 32
TWITTER_TOKEN_ENCRYPTION_KEY=
```

- [ ] **Step 8: type-check + build**

Run: `pnpm --filter @shipyard/api type-check && pnpm --filter @shipyard/api build`
Expected: エラーなし。

- [ ] **Step 9: コミット**

```bash
git add apps/api/src/common/crypto/ apps/api/src/app.module.ts apps/api/.env.example
git commit -m "feat(api): TokenEncryptionService(AES-256-GCM)+ CryptoModule(ADR-014 Day 56)"
```

---

### Task 5: assertWithinAnnouncementQuota を AIUsageService に追加

**Files:**
- Modify: `apps/api/src/ai/ai-usage.service.ts`
- Modify: `apps/api/src/ai/ai.constants.ts`

- [ ] **Step 1: ai.constants.ts に定数追加**

`apps/api/src/ai/ai.constants.ts` の末尾に追加:

```typescript
/** ANNOUNCEMENT_GEN の Anthropic API `max_tokens`(Twitter 100 tok + Blog 2500 tok + 余裕、ADR-014)。 */
export const ANNOUNCEMENT_GEN_MAX_TOKENS = 3072;

/** ANNOUNCEMENT_GEN の temperature(訴求文のバリエーション重視、DRAFT_GEN と同等、ADR-014)。 */
export const ANNOUNCEMENT_GEN_TEMPERATURE = 0.7;

/**
 * Pro プランの ANNOUNCEMENT_GEN 月次上限(MVP 暴走防止枠、ADR-014)。
 * 1 回 4-6 円 × 50 = 月 300 円が Pro ARPU の現実的天井。
 * v1.0.1 で AI クレジット制(4 cr/回、ADR-012)に移行。
 */
export const ANNOUNCEMENT_MAX_PER_MONTH_PRO = 50;
```

- [ ] **Step 1.5: creditsForUsage(or 等価の Feature credit map)に ANNOUNCEMENT_GEN を追加**

`apps/api/src/ai/ai.constants.ts`(or `ai-usage.service.ts` 内の credit 計算ヘルパー)で Feature 別の credit 重みを定義しているマップに以下を追加:

```typescript
// 既存マップに追加(ADR-012 v1.0.1 のクレジット制で参照される、ADR-014)
[Feature.ANNOUNCEMENT_GEN]: 4,
```

実際の場所は `creditsForUsage` 関数の switch 文 or `FEATURE_CREDIT_WEIGHTS: Record<Feature, number>` 等の定数。コードを Read で確認してから値 4 を加える(MVP では assertWithinAnnouncementQuota で実質制御するため値の影響は v1.0.1 切替時から)。

- [ ] **Step 2: ai-usage.service.ts に assertWithinAnnouncementQuota を追加**

`apps/api/src/ai/ai-usage.service.ts` の `assertWithinValidationQuota` の後に追加(import に `ANNOUNCEMENT_MAX_PER_MONTH_PRO` を加える):

```typescript
  /**
   * ANNOUNCEMENT_GEN の月次実行回数をチェック(ADR-014、Day 56)。
   *
   * - FREE プラン:本機能を実行不可(ADR-012 改訂版「Free フォールバック = AI 機能停止」)→ 403
   * - PRO / TEAM:本機能のみの月次上限 `ANNOUNCEMENT_MAX_PER_MONTH_PRO`(50 回)
   *
   * MVP の暴走防止枠。v1.0.1 で AI クレジット制(4 cr/回)に移行する際に
   * 本メソッドは `assertWithinCreditQuota({ feature, costInCredits })` 等に置き換える。
   *
   * 注:channel 数(MVP は 2 = Twitter + Blog、v1.x で 3 = + Email)に依存しない単位カウント
   * (Announcement 単位で 1 回として計上)。message も channel 固有名(「Twitter とブログ」 等)を
   * 出さない設計で v1.x の EMAIL 追加時に文言改修不要。
   */
  async assertWithinAnnouncementQuota(tenant: { id: string; plan: Plan }): Promise<void> {
    if (tenant.plan === Plan.FREE) {
      throw new ForbiddenException(
        '告知配信は Pro / Team プラン限定の機能です。Pro へのアップグレードが必要です。',
      );
    }
    const used = await this.prisma.aIUsage.count({
      where: {
        tenantId: tenant.id,
        createdAt: { gte: startOfMonthUtc() },
        feature: Feature.ANNOUNCEMENT_GEN,
      },
    });
    if (used >= ANNOUNCEMENT_MAX_PER_MONTH_PRO) {
      throw new ForbiddenException(
        `告知配信の月次実行回数上限(${ANNOUNCEMENT_MAX_PER_MONTH_PRO} 回)に達しました。翌月リセットされます。`,
      );
    }
  }
```

- [ ] **Step 3: type-check + build**

Run: `pnpm --filter @shipyard/api type-check && pnpm --filter @shipyard/api build`
Expected: エラーなし。

- [ ] **Step 4: コミット**

```bash
git add apps/api/src/ai/
git commit -m "feat(api): assertWithinAnnouncementQuota + ANNOUNCEMENT_GEN 定数(ADR-014 Day 56)"
```

---

## Day 57:BE Service + Controller + E2E

### Task 6: Announcement Tool スキーマ + 型定義 + 定数

**Files:**
- Create: `apps/api/src/announcements/announcement-types.ts`
- Create: `apps/api/src/announcements/announcement.constants.ts`
- Create: `apps/api/src/announcements/announcement-tool.ts`

- [ ] **Step 1: announcement.constants.ts を作成**

```typescript
/** Twitter 投稿の本文最大文字数(X API v2 仕様、ADR-014)。 */
export const TWITTER_TEXT_MAX = 280;

/** Blog 記事タイトル最大文字数(SEO 推奨、ADR-014)。 */
export const BLOG_TITLE_MAX = 120;

/** Blog 記事本文の最小文字数(空投稿防止、ADR-014)。 */
export const BLOG_BODY_MIN = 100;

/** Blog の OG description 用 summary 最大文字数(ADR-014)。 */
export const BLOG_SUMMARY_MAX = 200;

/** BlogPost slug の最大長(URL 長制約 + UX、ADR-014)。 */
export const BLOG_SLUG_MAX = 80;

/** Announcement.title の最大長。 */
export const ANNOUNCEMENT_TITLE_MAX = 120;

/** generate API の topic(ユーザーが伝えたい告知内容)の最大長。 */
export const ANNOUNCEMENT_TOPIC_MAX = 500;
```

- [ ] **Step 2: announcement-types.ts を作成**

```typescript
import type { DeliveryChannel } from '@shipyard/db';

/**
 * Sonnet 4 + Tool Use(`submit_announcement_drafts`)が返す多チャネル文面(ADR-014)。
 * MVP は twitter + blog のみ、v1.x で email を追加。
 */
export type AnnouncementDrafts = {
  twitter: {
    text: string; // 280 字以内、絵文字込み、hashtag は AI 判断
  };
  blog: {
    title: string;   // 60 字以内推奨
    body: string;    // Markdown 本文(500〜2000 字目安)
    summary: string; // OG description 用、120 字以内
  };
  // v1.x: email: { subject: string, htmlBody: string, plainTextBody: string }
};

/** Delivery.content の TWITTER ペイロード(ADR-014)。 */
export type TwitterDeliveryContent = {
  text: string;
};

/** Delivery.content の BLOG ペイロード(ADR-014、BlogPost 本体は別 entity)。 */
export type BlogDeliveryContent = {
  blogPostId: string;
  summary: string;
};

/** Delivery.content の型を channel で discriminate するヘルパー。 */
export type DeliveryContent =
  | { channel: 'TWITTER'; content: TwitterDeliveryContent }
  | { channel: 'BLOG'; content: BlogDeliveryContent };

/** channel の有効値(MVP)。`DeliveryChannel` enum と同期、配列順は UI 表示順。 */
export const ANNOUNCEMENT_CHANNELS: readonly DeliveryChannel[] = ['TWITTER', 'BLOG'];
```

- [ ] **Step 3: announcement-tool.ts を作成**

```typescript
import type { Anthropic } from '@anthropic-ai/sdk';

import { BLOG_BODY_MIN, BLOG_SUMMARY_MAX, BLOG_TITLE_MAX, TWITTER_TEXT_MAX } from './announcement.constants';
import type { AnnouncementDrafts } from './announcement-types';

/**
 * Anthropic Tool Use の input_schema(ADR-014)。
 * Sonnet 4 に「強制で」 この形で出力させる(`tool_choice: { type: 'tool', name: ... }`)。
 */
export const SUBMIT_ANNOUNCEMENT_DRAFTS_TOOL: Anthropic.Messages.Tool = {
  name: 'submit_announcement_drafts',
  description:
    'マルチチャネル告知配信の文面ドラフトを提出する。Twitter(280 字)と Blog(Markdown 本文)を一括で。',
  input_schema: {
    type: 'object',
    required: ['twitter', 'blog'],
    properties: {
      twitter: {
        type: 'object',
        required: ['text'],
        properties: {
          text: {
            type: 'string',
            maxLength: TWITTER_TEXT_MAX,
            description: '280 字以内の Tweet 本文。絵文字 1-2 個 + hashtag 1-2 個推奨。',
          },
        },
      },
      blog: {
        type: 'object',
        required: ['title', 'body', 'summary'],
        properties: {
          title: {
            type: 'string',
            maxLength: BLOG_TITLE_MAX,
            description: 'ブログ記事タイトル(60 字以内推奨)。',
          },
          body: {
            type: 'string',
            minLength: BLOG_BODY_MIN,
            description:
              'Markdown 本文。h2 / h3 見出し構造、リード → 機能 → CTA、画像はプレースホルダ ![alt](TODO)。',
          },
          summary: {
            type: 'string',
            maxLength: BLOG_SUMMARY_MAX,
            description: 'OG description 用の要約(120 字以内推奨)。',
          },
        },
      },
    },
  },
};

/** Tool Use の input を `AnnouncementDrafts` 型として安全に取り出す(LLM の制約破りもチェック)。 */
export function parseAnnouncementDrafts(input: unknown): AnnouncementDrafts {
  const obj = input as Partial<AnnouncementDrafts> | null | undefined;
  const twitter = obj?.twitter;
  const blog = obj?.blog;
  if (!twitter || typeof twitter.text !== 'string') {
    throw new Error('Tool output missing twitter.text (ANNOUNCEMENT_GEN)');
  }
  if (twitter.text.length === 0 || twitter.text.length > TWITTER_TEXT_MAX) {
    throw new Error(`twitter.text length out of range (ANNOUNCEMENT_GEN)`);
  }
  if (!blog || typeof blog.title !== 'string' || typeof blog.body !== 'string' || typeof blog.summary !== 'string') {
    throw new Error('Tool output missing blog.{title,body,summary} (ANNOUNCEMENT_GEN)');
  }
  if (blog.title.length === 0 || blog.title.length > BLOG_TITLE_MAX) {
    throw new Error(`blog.title length out of range (ANNOUNCEMENT_GEN)`);
  }
  if (blog.body.length < BLOG_BODY_MIN) {
    throw new Error(`blog.body too short (ANNOUNCEMENT_GEN)`);
  }
  return { twitter: { text: twitter.text }, blog: { title: blog.title, body: blog.body, summary: blog.summary } };
}
```

- [ ] **Step 4: type-check + build**

Run: `pnpm --filter @shipyard/api type-check && pnpm --filter @shipyard/api build`
Expected: エラーなし。

- [ ] **Step 5: コミット**

```bash
git add apps/api/src/announcements/
git commit -m "feat(api): Announcement Tool スキーマ + 型 + 定数(ADR-014 Day 57)"
```

---

### Task 7: AnnouncementGenService(Sonnet 4 + Tool Use)

**Files:**
- Create: `apps/api/src/announcements/announcement-gen.service.ts`

- [ ] **Step 1: AnnouncementGenService を作成**

```typescript
import { Injectable } from '@nestjs/common';

import {
  AI_MODEL_SONNET,
  ANNOUNCEMENT_GEN_MAX_TOKENS,
  ANNOUNCEMENT_GEN_TEMPERATURE,
} from '../ai/ai.constants';
import { AIBadResponseError } from '../ai/ai-error';
import { AnthropicService } from '../ai/anthropic.service';
import { AI_PERSONA_INTRO } from '../ai/prompts';
import { extractToolUseBlock } from '../ai/tool-use';
import { ANNOUNCEMENT_CHANNELS } from './announcement-types';
import type { AnnouncementDrafts } from './announcement-types';
import { parseAnnouncementDrafts, SUBMIT_ANNOUNCEMENT_DRAFTS_TOOL } from './announcement-tool';

interface ProjectContext {
  name: string;
  description: string | null;
  categoryDomain: string | null;
  pricingTier: string | null;
  targetUsers: string | null;
  problemStatement: string | null;
  proposedFeatures: string | null;
  pricingModel: string | null;
}

export interface GenerateAnnouncementInput {
  topic: string;
  project: ProjectContext;
  announcementTitle: string;
  channels?: ReadonlyArray<'TWITTER' | 'BLOG'>; // 部分再生成(指定がなければ全 channel)
  latestLpHero?: { heading: string; sub?: string }; // 最新 LP の hero ブロック抜粋
  latestReadmeExcerpt?: string; // 最新 README 冒頭 300 字程度
}

export interface GeneratedAnnouncement {
  drafts: AnnouncementDrafts;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

/**
 * 1 Announcement → Twitter 文 + Blog 本文を Sonnet 4 + Tool Use で一括生成する(ADR-014 §2)。
 *
 * - 既存 DRAFT_GEN(`ProjectDocument` に保存)とは別経路。本機能は `Delivery.content` に保存する。
 * - 部分再生成(channels 指定)もコスト・LLM コール 1 回固定。
 */
@Injectable()
export class AnnouncementGenService {
  constructor(private readonly anthropic: AnthropicService) {}

  async generate(input: GenerateAnnouncementInput): Promise<GeneratedAnnouncement> {
    const { topic, project, announcementTitle, channels, latestLpHero, latestReadmeExcerpt } = input;
    const activeChannels = channels && channels.length > 0 ? channels : ANNOUNCEMENT_CHANNELS;

    const systemPrompt = [
      AI_PERSONA_INTRO,
      '与えられたプロジェクト情報と告知トピックをもとに、Twitter と Blog の文面を一括で作成してください。',
      `生成対象チャネル: ${activeChannels.join(', ')}(指定外チャネルは出力しても無視されますが、最小限の文字数で構いません)`,
      '',
      '## Twitter のガイドライン',
      '- 280 字以内、簡潔に。プロダクト名 + 1 行訴求 + LP URL の構成を基本とする。',
      '- hashtag は 1-2 個、関連性が高いもの。',
      '- 絵文字 1-2 個でトーンを軽くする(過剰禁止)。',
      '',
      '## Blog のガイドライン',
      '- Markdown 本文、h2 / h3 見出し構造で読みやすく。',
      '- 構成:リード文 → 解決する課題 → 提供機能 → CTA。500-2000 字目安。',
      '- 画像が必要な箇所は `![説明](TODO)` のプレースホルダを置く(ユーザーが後で差し替える前提)。',
      '- 内部リンクは LP URL のみ(他は架空 URL を作らない)。',
      '',
      '## トーン統一',
      `- categoryDomain="${project.categoryDomain ?? '未設定'}" に合わせて自然に。`,
      '  - ENTERTAINMENT / LIFESTYLE / SOCIAL → 親しみやすく口語的に',
      '  - DEVELOPER_TOOL / PRODUCTIVITY → 技術的・端的に',
      '  - FINANCE / HEALTH / EDUCATION → 信頼感のある丁寧な文体に',
    ].join('\n');

    const lpSection = latestLpHero
      ? `\n## 最新 LP の hero(参考トーン)\n- heading: ${latestLpHero.heading}\n- sub: ${latestLpHero.sub ?? ''}`
      : '';
    const readmeSection = latestReadmeExcerpt
      ? `\n## 最新 README 抜粋(参考機能)\n${latestReadmeExcerpt.slice(0, 300)}`
      : '';

    const userText = [
      '# プロジェクト情報',
      `- 名前: ${project.name}`,
      `- 概要: ${project.description ?? '(未記入)'}`,
      `- カテゴリ: ${project.categoryDomain ?? '(未指定)'}`,
      `- 価格帯: ${project.pricingTier ?? '(未指定)'}`,
      `- 想定ユーザー: ${project.targetUsers ?? '(未記入)'}`,
      `- 解決課題: ${project.problemStatement ?? '(未記入)'}`,
      `- 提供機能: ${project.proposedFeatures ?? '(未記入)'}`,
      `- 課金モデル補足: ${project.pricingModel ?? '(未記入)'}`,
      lpSection,
      readmeSection,
      '',
      '# 告知の内部タイトル(参考、配信文面には含めない)',
      announcementTitle,
      '',
      '# 今回の告知トピック(これを伝えたい)',
      topic,
    ]
      .filter(Boolean)
      .join('\n');

    const res = await this.anthropic.client.messages.create({
      model: AI_MODEL_SONNET,
      max_tokens: ANNOUNCEMENT_GEN_MAX_TOKENS,
      temperature: ANNOUNCEMENT_GEN_TEMPERATURE,
      system: systemPrompt,
      tools: [SUBMIT_ANNOUNCEMENT_DRAFTS_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_ANNOUNCEMENT_DRAFTS_TOOL.name },
      messages: [{ role: 'user', content: userText }],
    });

    const block = extractToolUseBlock(res, 'ANNOUNCEMENT_GEN');
    let drafts: AnnouncementDrafts;
    try {
      drafts = parseAnnouncementDrafts(block.input);
    } catch (err) {
      throw new AIBadResponseError(
        `ANNOUNCEMENT_GEN: ${(err as Error).message}`,
        { cause: err as Error },
      );
    }
    return {
      drafts,
      model: AI_MODEL_SONNET,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
    };
  }
}
```

- [ ] **Step 2: type-check + build**

Run: `pnpm --filter @shipyard/api type-check && pnpm --filter @shipyard/api build`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add apps/api/src/announcements/announcement-gen.service.ts
git commit -m "feat(api): AnnouncementGenService(Sonnet 4 + Tool Use)(ADR-014 Day 57)"
```

---

### Task 8: Twitter constants + TwitterAuthService(OAuth state + PKCE + Redis)

**Files:**
- Create: `apps/api/src/integrations/twitter/twitter.constants.ts`
- Create: `apps/api/src/integrations/twitter/twitter-auth.service.ts`

- [ ] **Step 1: twitter.constants.ts を作成**

```typescript
/** OAuth state の TTL(秒、ADR-014)。5 分。 */
export const TWITTER_AUTH_STATE_TTL_SECONDS = 300;

/** X OAuth 2.0 で要求する scope(`offline.access` で refresh_token 取得、ADR-014)。 */
export const TWITTER_SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'offline.access',
] as const;

/** X 認可エンドポイント。 */
export const TWITTER_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';

/** X token エンドポイント。 */
export const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';

/** X 自ユーザー情報エンドポイント。 */
export const TWITTER_USER_ME_URL = 'https://api.twitter.com/2/users/me';

/** X tweet 投稿エンドポイント。 */
export const TWITTER_TWEETS_URL = 'https://api.twitter.com/2/tweets';

/** X token revoke エンドポイント。 */
export const TWITTER_REVOKE_URL = 'https://api.twitter.com/2/oauth2/revoke';

/** access_token expire 直前の buffer(秒)。これ以下なら refresh する。 */
export const TWITTER_TOKEN_REFRESH_BUFFER_SECONDS = 300;

/** Redis key の prefix。 */
export const TWITTER_OAUTH_STATE_KEY_PREFIX = 'twitter_oauth:';
```

- [ ] **Step 2: TwitterAuthService を作成**

```typescript
import { createHash, randomBytes } from 'node:crypto';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

import {
  TWITTER_AUTH_STATE_TTL_SECONDS,
  TWITTER_AUTHORIZE_URL,
  TWITTER_OAUTH_STATE_KEY_PREFIX,
  TWITTER_SCOPES,
  TWITTER_TOKEN_URL,
  TWITTER_USER_ME_URL,
} from './twitter.constants';

export interface OauthStatePayload {
  verifier: string;
  tenantId: string;
  userId: string;
  returnSlug: string;
}

interface TwitterTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

interface TwitterUserResponse {
  data: { id: string; username: string };
}

/**
 * Twitter OAuth 2.0 PKCE フロー(ADR-014 §4)。
 *
 * - state + code_verifier を Upstash Redis に保存(5 分 TTL)
 * - callback で state を検証 → DEL(使い捨て、replay 防止)
 * - code を access_token に交換し、暗号化前の raw token + user info を返す
 *
 * 暗号化と DB upsert は IntegrationsTwitterController 側で実施
 * (本 service は X とのプロトコル責務に集中)。
 */
@Injectable()
export class TwitterAuthService {
  private readonly logger = new Logger(TwitterAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.clientId = config.getOrThrow<string>('TWITTER_CLIENT_ID');
    this.clientSecret = config.getOrThrow<string>('TWITTER_CLIENT_SECRET');
    this.redirectUri = config.getOrThrow<string>('TWITTER_REDIRECT_URI');
    this.redis = new Redis({
      url: config.getOrThrow<string>('UPSTASH_REDIS_REST_URL'),
      token: config.getOrThrow<string>('UPSTASH_REDIS_REST_TOKEN'),
    });
  }

  /** state + PKCE を生成して Redis に保存し、X 認可 URL を返す。 */
  async buildAuthorizeUrl(args: { tenantId: string; userId: string; returnSlug: string }): Promise<string> {
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(64).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const payload: OauthStatePayload = {
      verifier,
      tenantId: args.tenantId,
      userId: args.userId,
      returnSlug: args.returnSlug,
    };
    await this.redis.set(
      `${TWITTER_OAUTH_STATE_KEY_PREFIX}${state}`,
      JSON.stringify(payload),
      { ex: TWITTER_AUTH_STATE_TTL_SECONDS },
    );

    const url = new URL(TWITTER_AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', TWITTER_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  /**
   * callback の state を検証して PKCE verifier を取り出す(使い捨て:取得直後に DEL)。
   * 不在 = 期限切れ or リプレイ → 400。
   */
  async consumeState(state: string): Promise<OauthStatePayload> {
    const key = `${TWITTER_OAUTH_STATE_KEY_PREFIX}${state}`;
    const raw = await this.redis.get<string>(key);
    if (!raw) {
      throw new BadRequestException('リンクが無効か期限切れです。再度連携をお試しください。');
    }
    await this.redis.del(key);
    return JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)) as OauthStatePayload;
  }

  /** code + verifier を access_token に交換する(MVP)。 */
  async exchangeCode(args: { code: string; verifier: string }): Promise<TwitterTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: this.redirectUri,
      code_verifier: args.verifier,
      client_id: this.clientId,
    });
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(TWITTER_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Twitter token exchange failed: ${res.status} ${text}`);
      throw new BadRequestException('Twitter からトークンを取得できませんでした。');
    }
    const json = (await res.json()) as TwitterTokenResponse;
    if (!json.scope?.includes('tweet.write') || !json.scope?.includes('offline.access')) {
      throw new BadRequestException('必要な権限が付与されていません(tweet.write / offline.access)。再度連携を試してください。');
    }
    return json;
  }

  /** access_token で自ユーザー情報(handle + id)を取得する。 */
  async fetchSelf(accessToken: string): Promise<{ xUserId: string; handle: string }> {
    const res = await fetch(TWITTER_USER_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new BadRequestException('Twitter ユーザー情報を取得できませんでした。');
    }
    const json = (await res.json()) as TwitterUserResponse;
    return { xUserId: json.data.id, handle: json.data.username };
  }
}
```

- [ ] **Step 3: @upstash/redis が既存依存か確認、無ければ追加**

Run: `grep "@upstash/redis" apps/api/package.json`
無ければ:`pnpm --filter @shipyard/api add @upstash/redis`

- [ ] **Step 4: .env.example に Twitter / Upstash env を追加**

`apps/api/.env.example` に追加(Upstash が既存なら重複を避ける):

```bash
# Twitter OAuth 2.0 PKCE(ADR-014)
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
TWITTER_REDIRECT_URI=http://localhost:3000/webhooks/twitter/callback

# Upstash Redis(OAuth state 保管用)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

- [ ] **Step 5: type-check + build**

Run: `pnpm --filter @shipyard/api type-check && pnpm --filter @shipyard/api build`
Expected: エラーなし。

- [ ] **Step 6: コミット**

```bash
git add apps/api/src/integrations/twitter/twitter.constants.ts apps/api/src/integrations/twitter/twitter-auth.service.ts apps/api/.env.example apps/api/package.json
git commit -m "feat(api): TwitterAuthService(OAuth 2.0 PKCE + state Redis)+ 定数(ADR-014 Day 57)"
```

---

### Task 9: TwitterClientService(refresh + postTweet + revoke)

**Files:**
- Create: `apps/api/src/integrations/twitter/twitter-client.service.ts`

- [ ] **Step 1: TwitterClientService を作成**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TwitterAccount } from '@shipyard/db';

import { PrismaService } from '../../prisma/prisma.service';
import { TokenEncryptionService } from '../../common/crypto/token-encryption.service';
import {
  TWITTER_REVOKE_URL,
  TWITTER_TOKEN_REFRESH_BUFFER_SECONDS,
  TWITTER_TOKEN_URL,
  TWITTER_TWEETS_URL,
} from './twitter.constants';

interface TwitterTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** postTweet の戻り値(成功時 = X 側 tweet id を保持)。 */
export interface PostTweetResult {
  tweetId: string;
}

/** 失敗時の Twitter API エラー分類(ユーザー向け文言の出し分け、ADR-014 §6)。 */
export class TwitterApiError extends Error {
  constructor(
    public readonly kind: 'TOKEN_EXPIRED' | 'SUSPENDED' | 'RATE_LIMIT' | 'SERVER' | 'NETWORK' | 'UNKNOWN',
    public readonly userMessage: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(userMessage);
  }
}

/**
 * Twitter API v2 client(ADR-014 §4)。
 *
 * - getValidAccessToken: expiresAt 5min 前 buffer で自動 refresh + DB 更新
 * - postTweet: `POST /2/tweets`、失敗を `TwitterApiError` に分類
 * - revoke: 切断時に best-effort で `POST /2/oauth2/revoke`(失敗してもローカル削除は実行)
 */
@Injectable()
export class TwitterClientService {
  private readonly logger = new Logger(TwitterClientService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: TokenEncryptionService,
  ) {
    this.clientId = config.getOrThrow<string>('TWITTER_CLIENT_ID');
    this.clientSecret = config.getOrThrow<string>('TWITTER_CLIENT_SECRET');
  }

  /** access_token を取得(必要なら refresh)。 */
  async getValidAccessToken(account: TwitterAccount): Promise<string> {
    if (account.expiresAt.getTime() - Date.now() > TWITTER_TOKEN_REFRESH_BUFFER_SECONDS * 1000) {
      return this.crypto.decrypt(account.accessToken);
    }
    const refreshToken = this.crypto.decrypt(account.refreshToken);
    const refreshed = await this.refresh(refreshToken);
    await this.prisma.twitterAccount.update({
      where: { id: account.id },
      data: {
        accessToken: this.crypto.encrypt(refreshed.access_token),
        refreshToken: this.crypto.encrypt(refreshed.refresh_token),
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
    return refreshed.access_token;
  }

  /** 内部:refresh_token で新しい access_token を取得。 */
  private async refresh(refreshToken: string): Promise<TwitterTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
    });
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(TWITTER_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Twitter token refresh failed: ${res.status} ${text}`);
      throw new TwitterApiError(
        'TOKEN_EXPIRED',
        'X の認証情報が失効しました。設定画面から再連携してください。',
      );
    }
    return (await res.json()) as TwitterTokenResponse;
  }

  /** Tweet を投稿(失敗時は TwitterApiError をスロー、Service 層で catch して Delivery.error に保存)。 */
  async postTweet(account: TwitterAccount, text: string): Promise<PostTweetResult> {
    const token = await this.getValidAccessToken(account);
    const res = await fetch(TWITTER_TWEETS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.status === 401) {
      throw new TwitterApiError(
        'TOKEN_EXPIRED',
        'X の認証情報が失効しました。設定画面から再連携してください。',
      );
    }
    if (res.status === 403) {
      throw new TwitterApiError(
        'SUSPENDED',
        'X アカウントが利用制限を受けています。',
      );
    }
    if (res.status === 429) {
      const retryAfter = Number.parseInt(res.headers.get('retry-after') ?? '0', 10);
      throw new TwitterApiError(
        'RATE_LIMIT',
        `X 投稿の上限に達しました。${retryAfter > 0 ? `${retryAfter} 秒後に` : 'しばらくしてから'}再実行してください。`,
        retryAfter,
      );
    }
    if (!res.ok) {
      this.logger.warn(`Twitter post failed: ${res.status}`);
      throw new TwitterApiError(
        'SERVER',
        'X 側で一時的な障害が発生しています。再実行してください。',
      );
    }
    const json = (await res.json()) as { data: { id: string } };
    return { tweetId: json.data.id };
  }

  /** revoke(best-effort、失敗してもローカル削除は実行)。 */
  async revoke(account: TwitterAccount): Promise<void> {
    try {
      const token = this.crypto.decrypt(account.accessToken);
      const body = new URLSearchParams({ token, client_id: this.clientId });
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      await fetch(TWITTER_REVOKE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
        body,
      });
    } catch (err) {
      this.logger.warn(`Twitter revoke failed (best-effort): ${(err as Error).message}`);
    }
  }
}
```

- [ ] **Step 2: type-check + build**

Run: `pnpm --filter @shipyard/api type-check && pnpm --filter @shipyard/api build`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add apps/api/src/integrations/twitter/twitter-client.service.ts
git commit -m "feat(api): TwitterClientService(refresh + postTweet + revoke)(ADR-014 Day 57)"
```

---

### Task 10: IntegrationsTwitterController + IntegrationsTwitterModule(OAuth 4 endpoints)

**Files:**
- Create: `apps/api/src/integrations/twitter/integrations-twitter.controller.ts`
- Create: `apps/api/src/integrations/twitter/integrations-twitter.module.ts`

- [ ] **Step 1: IntegrationsTwitterController を作成**

```typescript
import { Controller, Delete, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';

import { ClerkAuthGuard } from '../../auth/clerk-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { CurrentWorkspace } from '../../auth/current-workspace.decorator';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '@shipyard/db';
import { ADMIN_ROLES } from '../../auth/roles';
import { WorkspaceGuard } from '../../auth/workspace.guard';
import { TokenEncryptionService } from '../../common/crypto/token-encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TwitterAuthService } from './twitter-auth.service';
import { TwitterClientService } from './twitter-client.service';
import { TWITTER_SCOPES } from './twitter.constants';

/**
 * Twitter (X) アカウント連携 API(ADR-014 §3)。
 *
 * - GET authorize: OAuth 開始(OWNER / ADMIN のみ、認可付きで slug 必須)
 * - GET callback: OAuth callback(認証不要、state 検証で代替)
 * - GET (list): 連携一覧(全テナントメンバー、token は返さない)
 * - DELETE (disconnect): 切断(OWNER / ADMIN)
 *
 * 注:callback ルートは `/webhooks/twitter/callback` で WebhooksController に置く(本 controller は workspace 配下)。
 */
@Controller('workspaces/:slug/integrations/twitter')
@UseGuards(ClerkAuthGuard)
export class IntegrationsTwitterController {
  private readonly appBaseUrl: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly twitterAuth: TwitterAuthService,
    private readonly twitterClient: TwitterClientService,
    private readonly crypto: TokenEncryptionService,
  ) {
    this.appBaseUrl = config.getOrThrow<string>('APP_BASE_URL');
  }

  @Get('authorize')
  @UseGuards(WorkspaceGuard)
  @Roles(...ADMIN_ROLES)
  async authorize(
    @CurrentWorkspace() ws: { id: string; slug: string },
    @CurrentUser() user: { id: string },
    @Res() res: Response,
  ) {
    const url = await this.twitterAuth.buildAuthorizeUrl({
      tenantId: ws.id,
      userId: user.id,
      returnSlug: ws.slug,
    });
    return res.redirect(302, url);
  }

  @Get()
  @UseGuards(WorkspaceGuard)
  async list(@CurrentWorkspace() ws: { id: string }) {
    const accounts = await this.prisma.twitterAccount.findMany({
      where: { tenantId: ws.id },
      select: {
        id: true,
        handle: true,
        xUserId: true,
        connectedById: true,
        expiresAt: true,
        createdAt: true,
        scopes: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return { accounts };
  }

  @Delete(':accountId')
  @UseGuards(WorkspaceGuard)
  @Roles(...ADMIN_ROLES)
  async disconnect(
    @CurrentWorkspace() ws: { id: string },
    @Param('accountId') accountId: string,
  ) {
    const account = await this.prisma.twitterAccount.findFirst({
      where: { id: accountId, tenantId: ws.id },
    });
    if (!account) {
      return { ok: true }; // 既に消えていれば冪等に成功
    }
    await this.twitterClient.revoke(account);
    await this.prisma.twitterAccount.delete({ where: { id: account.id } });
    return { ok: true };
  }
}
```

- [ ] **Step 2: WebhooksController に Twitter callback ルートを追加**

`apps/api/src/webhooks/webhooks.controller.ts` を Read してから、以下のハンドラを末尾に追加:

```typescript
  @Get('twitter/callback')
  @Redirect()
  async twitterCallback(@Query('state') state: string, @Query('code') code: string) {
    const payload = await this.twitterAuth.consumeState(state);
    const tokens = await this.twitterAuth.exchangeCode({ code, verifier: payload.verifier });
    const self = await this.twitterAuth.fetchSelf(tokens.access_token);

    // xUserId 重複 = 別テナントで既に連携済みの場合、@@unique で 409
    try {
      await this.prisma.twitterAccount.upsert({
        where: {
          tenantId_xUserId: { tenantId: payload.tenantId, xUserId: self.xUserId },
        },
        create: {
          tenantId: payload.tenantId,
          connectedById: payload.userId,
          xUserId: self.xUserId,
          handle: self.handle,
          accessToken: this.crypto.encrypt(tokens.access_token),
          refreshToken: this.crypto.encrypt(tokens.refresh_token),
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          scopes: [...TWITTER_SCOPES],
        },
        update: {
          connectedById: payload.userId,
          handle: self.handle,
          accessToken: this.crypto.encrypt(tokens.access_token),
          refreshToken: this.crypto.encrypt(tokens.refresh_token),
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          scopes: [...TWITTER_SCOPES],
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        return { url: `${this.appBaseUrl}/w/${payload.returnSlug}/settings/integrations?error=twitter_already_connected`, statusCode: 302 };
      }
      throw err;
    }
    return { url: `${this.appBaseUrl}/w/${payload.returnSlug}/settings/integrations?connected=twitter`, statusCode: 302 };
  }
```

`WebhooksController` の constructor に `TwitterAuthService` / `PrismaService` / `TokenEncryptionService` / `ConfigService` の DI を加える(既存依存に応じて adapter コード補完)。

- [ ] **Step 3: IntegrationsTwitterModule を作成**

```typescript
import { Module } from '@nestjs/common';

import { IntegrationsTwitterController } from './integrations-twitter.controller';
import { TwitterAuthService } from './twitter-auth.service';
import { TwitterClientService } from './twitter-client.service';

@Module({
  controllers: [IntegrationsTwitterController],
  providers: [TwitterAuthService, TwitterClientService],
  exports: [TwitterAuthService, TwitterClientService],
})
export class IntegrationsTwitterModule {}
```

- [ ] **Step 4: app.module.ts に IntegrationsTwitterModule + WebhooksController 修正分を反映**

`apps/api/src/app.module.ts` の `imports` に `IntegrationsTwitterModule` を追加。`WebhooksModule`(or 等価)が `IntegrationsTwitterModule` を import するか確認、無ければ追加。

- [ ] **Step 5: type-check + build**

Run: `pnpm --filter @shipyard/api type-check && pnpm --filter @shipyard/api build`
Expected: エラーなし。

- [ ] **Step 6: コミット**

```bash
git add apps/api/src/integrations/twitter/ apps/api/src/webhooks/ apps/api/src/app.module.ts
git commit -m "feat(api): IntegrationsTwitterController(4 endpoints)+ webhooks/twitter/callback(ADR-014 Day 57)"
```

---

### Task 11: BlogPostService + BlogPostController + BlogPostPublicController + Module

**Files:**
- Create: `apps/api/src/blog-posts/blog-post.service.ts`
- Create: `apps/api/src/blog-posts/blog-post.controller.ts`
- Create: `apps/api/src/blog-posts/blog-post-public.controller.ts`
- Create: `apps/api/src/blog-posts/blog-post.module.ts`
- Create: `apps/api/src/blog-posts/dto/update-blog-post.dto.ts`

- [ ] **Step 1: update-blog-post.dto.ts を作成**

```typescript
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { BLOG_BODY_MIN, BLOG_SLUG_MAX, BLOG_TITLE_MAX } from '../../announcements/announcement.constants';

export class UpdateBlogPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(BLOG_TITLE_MAX)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(BLOG_BODY_MIN)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(BLOG_SLUG_MAX)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug は半角小文字 + 数字 + ハイフンのみ使用可' })
  slug?: string;

  /** true = 公開(publishedAt = now)、false = 下書きに戻す(publishedAt = null)。 */
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
```

- [ ] **Step 2: blog-post.service.ts を作成**

```typescript
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@shipyard/db';

import { isPrismaError, PRISMA_UNIQUE_VIOLATION } from '@shipyard/db';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateBlogPostDto } from './dto/update-blog-post.dto';

@Injectable()
export class BlogPostService {
  constructor(private readonly prisma: PrismaService) {}

  async listByProject(tenantId: string, projectId: string) {
    return this.prisma.blogPost.findMany({
      where: { tenantId, projectId },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getById(tenantId: string, projectId: string, id: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { id, tenantId, projectId },
    });
    if (!post) throw new NotFoundException('指定されたブログ記事が見つかりません。');
    return post;
  }

  async update(tenantId: string, projectId: string, id: string, dto: UpdateBlogPostDto) {
    const existing = await this.getById(tenantId, projectId, id);
    try {
      return await this.prisma.blogPost.update({
        where: { id: existing.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.body !== undefined ? { body: dto.body } : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
          ...(dto.published !== undefined
            ? { publishedAt: dto.published ? new Date() : null }
            : {}),
        },
      });
    } catch (err) {
      if (isPrismaError(err, PRISMA_UNIQUE_VIOLATION)) {
        throw new ConflictException('この slug は既にこのプロジェクトで使われています。');
      }
      throw err;
    }
  }

  /** 公開 API:slug + projectId で公開済ブログを取得。下書き / 不在 → 404。 */
  async findPublic(slug: string, projectId: string, postSlug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: {
        slug: postSlug,
        projectId,
        publishedAt: { not: null },
        tenant: { slug },
      },
      select: {
        title: true,
        body: true,
        publishedAt: true,
        slug: true,
        project: { select: { name: true, id: true } },
        tenant: { select: { slug: true } },
      },
    });
    if (!post) throw new NotFoundException('指定された記事が見つかりません。');
    return post;
  }
}
```

- [ ] **Step 3: blog-post.controller.ts を作成(管理画面 3 endpoints)**

```typescript
import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles } from '../auth/roles.decorator';
import { WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { BlogPostService } from './blog-post.service';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

@Controller('workspaces/:slug/projects/:projectId/blog-posts')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class BlogPostController {
  constructor(private readonly service: BlogPostService) {}

  @Get()
  async list(@CurrentWorkspace() ws: { id: string }, @Param('projectId') projectId: string) {
    return { posts: await this.service.listByProject(ws.id, projectId) };
  }

  @Get(':id')
  async get(
    @CurrentWorkspace() ws: { id: string },
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.getById(ws.id, projectId, id);
  }

  @Patch(':id')
  @Roles(...WRITER_ROLES)
  async update(
    @CurrentWorkspace() ws: { id: string },
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBlogPostDto,
  ) {
    return this.service.update(ws.id, projectId, id, dto);
  }
}
```

- [ ] **Step 4: blog-post-public.controller.ts を作成(未認証 1 endpoint)**

```typescript
import { Controller, Get, Param } from '@nestjs/common';

import { BlogPostService } from './blog-post.service';

/**
 * 公開ブログ API(ADR-014 §3)。
 *
 * `/public/blog-posts/:slug/:projectId/:postSlug` で未認証アクセス可。
 * 公開済(publishedAt セット)のみ返却。内部フィールドは select で除外。
 */
@Controller('public/blog-posts')
export class BlogPostPublicController {
  constructor(private readonly service: BlogPostService) {}

  @Get(':slug/:projectId/:postSlug')
  async getPublic(
    @Param('slug') slug: string,
    @Param('projectId') projectId: string,
    @Param('postSlug') postSlug: string,
  ) {
    return this.service.findPublic(slug, projectId, postSlug);
  }
}
```

- [ ] **Step 5: blog-post.module.ts を作成**

```typescript
import { Module } from '@nestjs/common';

import { BlogPostController } from './blog-post.controller';
import { BlogPostPublicController } from './blog-post-public.controller';
import { BlogPostService } from './blog-post.service';

@Module({
  controllers: [BlogPostController, BlogPostPublicController],
  providers: [BlogPostService],
  exports: [BlogPostService],
})
export class BlogPostModule {}
```

- [ ] **Step 6: app.module.ts に登録**

`apps/api/src/app.module.ts` の `imports` に `BlogPostModule` を追加。

- [ ] **Step 7: type-check + build**

Run: `pnpm --filter @shipyard/api type-check && pnpm --filter @shipyard/api build`
Expected: エラーなし。

- [ ] **Step 8: コミット**

```bash
git add apps/api/src/blog-posts/ apps/api/src/app.module.ts
git commit -m "feat(api): BlogPostService + Controller(管理 3 + 公開 1)(ADR-014 Day 57)"
```

---

### Task 12: AnnouncementService(CRUD + generate + executeDelivery dispatcher)

**Files:**
- Create: `apps/api/src/announcements/announcement.service.ts`
- Create: `apps/api/src/announcements/dto/create-announcement.dto.ts`
- Create: `apps/api/src/announcements/dto/update-announcement.dto.ts`
- Create: `apps/api/src/announcements/dto/generate-announcement.dto.ts`

- [ ] **Step 1: DTO 3 つを作成**

`apps/api/src/announcements/dto/create-announcement.dto.ts`:

```typescript
import { IsString, MaxLength, MinLength } from 'class-validator';

import { ANNOUNCEMENT_TITLE_MAX } from '../announcement.constants';

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(ANNOUNCEMENT_TITLE_MAX)
  title!: string;
}
```

`apps/api/src/announcements/dto/update-announcement.dto.ts`:

```typescript
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { ANNOUNCEMENT_TITLE_MAX, TWITTER_TEXT_MAX } from '../announcement.constants';

class TwitterContentInput {
  @IsString()
  @MaxLength(TWITTER_TEXT_MAX)
  text!: string;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MaxLength(ANNOUNCEMENT_TITLE_MAX)
  title?: string;

  /** Twitter Delivery の content 直接編集(280 字超過は class-validator で reject)。 */
  @IsOptional()
  @IsObject()
  twitterContent?: TwitterContentInput;

  /** Blog Delivery の BlogPost を編集する場合は `PATCH /blog-posts/:id` を使うため本 DTO では受けない。 */
}
```

`apps/api/src/announcements/dto/generate-announcement.dto.ts`:

```typescript
import { ArrayUnique, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { ANNOUNCEMENT_CHANNELS } from '../announcement-types';
import { ANNOUNCEMENT_TOPIC_MAX } from '../announcement.constants';

export class GenerateAnnouncementDto {
  /** ユーザーが伝えたい告知トピック(自由入力)。 */
  @IsString()
  @MinLength(1)
  @MaxLength(ANNOUNCEMENT_TOPIC_MAX)
  topic!: string;

  /** 部分再生成。未指定なら全 channel。 */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ANNOUNCEMENT_CHANNELS as readonly string[], { each: true })
  channels?: Array<'TWITTER' | 'BLOG'>;
}
```

- [ ] **Step 2: announcement.service.ts を作成**

```typescript
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AnnouncementStatus, DeliveryChannel, DeliveryStatus, Feature, type Plan } from '@shipyard/db';

import { AIUsageService } from '../ai/ai-usage.service';
import { TwitterApiError, TwitterClientService } from '../integrations/twitter/twitter-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { ANNOUNCEMENT_CHANNELS } from './announcement-types';
import type { BlogDeliveryContent, TwitterDeliveryContent } from './announcement-types';
import { AnnouncementGenService } from './announcement-gen.service';
import { BLOG_BODY_MIN, BLOG_TITLE_MAX } from './announcement.constants';
import type { CreateAnnouncementDto } from './dto/create-announcement.dto';
import type { GenerateAnnouncementDto } from './dto/generate-announcement.dto';
import type { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiUsage: AIUsageService,
    private readonly gen: AnnouncementGenService,
    private readonly twitterClient: TwitterClientService,
  ) {}

  async create(tenantId: string, projectId: string, userId: string, dto: CreateAnnouncementDto) {
    return this.prisma.announcement.create({
      data: {
        tenantId,
        projectId,
        title: dto.title,
        createdById: userId,
        status: AnnouncementStatus.DRAFT,
      },
    });
  }

  async list(tenantId: string, projectId: string) {
    const items = await this.prisma.announcement.findMany({
      where: { tenantId, projectId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        deliveries: { select: { channel: true, status: true } },
      },
    });
    return { items };
  }

  async getDetail(tenantId: string, projectId: string, id: string) {
    const item = await this.prisma.announcement.findFirst({
      where: { id, tenantId, projectId },
      include: { deliveries: { orderBy: { channel: 'asc' } } },
    });
    if (!item) throw new NotFoundException('指定された告知が見つかりません。');
    return item;
  }

  async update(tenantId: string, projectId: string, id: string, dto: UpdateAnnouncementDto) {
    const existing = await this.getDetail(tenantId, projectId, id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.title !== undefined) {
        await tx.announcement.update({ where: { id: existing.id }, data: { title: dto.title } });
      }
      if (dto.twitterContent) {
        const twitter = existing.deliveries.find((d) => d.channel === DeliveryChannel.TWITTER);
        if (twitter) {
          await tx.delivery.update({
            where: { id: twitter.id },
            data: { content: { text: dto.twitterContent.text } satisfies TwitterDeliveryContent },
          });
        }
      }
      return tx.announcement.findFirst({
        where: { id: existing.id },
        include: { deliveries: { orderBy: { channel: 'asc' } } },
      });
    });
  }

  async delete(tenantId: string, projectId: string, id: string) {
    const existing = await this.getDetail(tenantId, projectId, id);
    await this.prisma.announcement.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  /**
   * Sonnet 4 + Tool Use で多チャネル文面を生成して Delivery.content にセット(ADR-014 §2)。
   * - tenant.plan に応じて quota チェック(`assertWithinAnnouncementQuota`)
   * - 既存 Delivery を上書き(履歴は持たない、最新が真実)
   * - 部分再生成(channels 指定)も 4 cr 1 回固定
   * - 成功時 status = READY、失敗時は AIBadResponseError を上位に伝播
   */
  async generate(args: {
    tenantId: string;
    projectId: string;
    id: string;
    userId: string;
    plan: Plan;
    dto: GenerateAnnouncementDto;
  }) {
    await this.aiUsage.assertWithinAnnouncementQuota({ id: args.tenantId, plan: args.plan });

    const announcement = await this.getDetail(args.tenantId, args.projectId, args.id);
    const project = await this.prisma.project.findFirstOrThrow({
      where: { id: args.projectId, tenantId: args.tenantId },
      select: {
        name: true,
        description: true,
        categoryDomain: true,
        pricingTier: true,
        targetUsers: true,
        problemStatement: true,
        proposedFeatures: true,
        pricingModel: true,
      },
    });

    // 最新 LP の hero(参考)
    const lp = await this.prisma.landingPage.findFirst({
      where: { projectId: args.projectId, tenantId: args.tenantId },
      select: { blocks: true },
    });
    const heroRaw = Array.isArray(lp?.blocks)
      ? (lp!.blocks as Array<{ type: string; heading?: string; sub?: string }>).find((b) => b.type === 'hero')
      : undefined;
    const latestLpHero = heroRaw?.heading ? { heading: heroRaw.heading, sub: heroRaw.sub } : undefined;

    // 最新 README 抜粋(参考)
    const readme = await this.prisma.projectDocument.findFirst({
      where: { projectId: args.projectId, tenantId: args.tenantId, type: 'README', deletedAt: null },
      orderBy: { version: 'desc' },
      select: { content: true },
    });

    const generated = await this.gen.generate({
      topic: args.dto.topic,
      project,
      announcementTitle: announcement.title,
      channels: args.dto.channels,
      latestLpHero,
      latestReadmeExcerpt: readme?.content?.slice(0, 300),
    });

    const channelsToWrite = args.dto.channels && args.dto.channels.length > 0
      ? args.dto.channels
      : ANNOUNCEMENT_CHANNELS;

    await this.prisma.$transaction(async (tx) => {
      // Twitter
      if (channelsToWrite.includes(DeliveryChannel.TWITTER)) {
        await tx.delivery.upsert({
          where: { announcementId_channel: { announcementId: args.id, channel: DeliveryChannel.TWITTER } },
          create: {
            tenantId: args.tenantId,
            announcementId: args.id,
            channel: DeliveryChannel.TWITTER,
            status: DeliveryStatus.DRAFT,
            content: { text: generated.drafts.twitter.text } satisfies TwitterDeliveryContent,
          },
          update: {
            content: { text: generated.drafts.twitter.text } satisfies TwitterDeliveryContent,
            status: DeliveryStatus.DRAFT, // 再生成で SENT を上書きしないようコード側で SENT/FAILED は保護
          },
        });
      }
      // Blog: BlogPost を upsert(slug は title から派生)+ Delivery を紐付け
      if (channelsToWrite.includes(DeliveryChannel.BLOG)) {
        const slug = slugify(generated.drafts.blog.title);
        const existingBlogDelivery = announcement.deliveries.find((d) => d.channel === DeliveryChannel.BLOG);
        const existingPost = existingBlogDelivery?.id
          ? await tx.blogPost.findUnique({ where: { deliveryId: existingBlogDelivery.id } })
          : null;
        const post = existingPost
          ? await tx.blogPost.update({
              where: { id: existingPost.id },
              data: {
                title: generated.drafts.blog.title,
                body: generated.drafts.blog.body,
                // slug は ユーザー編集を尊重するため再生成では更新しない
              },
            })
          : await tx.blogPost.create({
              data: {
                tenantId: args.tenantId,
                projectId: args.projectId,
                slug: await this.findUniqueBlogSlug(tx, args.tenantId, args.projectId, slug),
                title: generated.drafts.blog.title,
                body: generated.drafts.blog.body,
              },
            });
        await tx.delivery.upsert({
          where: { announcementId_channel: { announcementId: args.id, channel: DeliveryChannel.BLOG } },
          create: {
            tenantId: args.tenantId,
            announcementId: args.id,
            channel: DeliveryChannel.BLOG,
            status: DeliveryStatus.DRAFT,
            content: { blogPostId: post.id, summary: generated.drafts.blog.summary } satisfies BlogDeliveryContent,
          },
          update: {
            content: { blogPostId: post.id, summary: generated.drafts.blog.summary } satisfies BlogDeliveryContent,
            status: DeliveryStatus.DRAFT,
          },
        });
        // BlogPost と Delivery を紐付け
        await tx.blogPost.update({
          where: { id: post.id },
          data: { delivery: { connect: { announcementId_channel: { announcementId: args.id, channel: DeliveryChannel.BLOG } } } },
        });
      }
      await tx.announcement.update({
        where: { id: args.id },
        data: { status: AnnouncementStatus.READY },
      });
    });

    await this.aiUsage.record({
      tenantId: args.tenantId,
      userId: args.userId,
      model: generated.model,
      feature: Feature.ANNOUNCEMENT_GEN,
      tokensIn: generated.tokensIn,
      tokensOut: generated.tokensOut,
    });

    return this.getDetail(args.tenantId, args.projectId, args.id);
  }

  /**
   * Delivery 実行(MVP は同期即時)。Twitter = POST tweet / Blog = publishedAt セット(ADR-014 §3)。
   * 失敗時は Delivery.status = FAILED + error にユーザー向け文言。再実行可能。
   */
  async executeDelivery(args: {
    tenantId: string;
    projectId: string;
    announcementId: string;
    deliveryId: string;
    userId: string;
  }) {
    const announcement = await this.getDetail(args.tenantId, args.projectId, args.announcementId);
    const delivery = announcement.deliveries.find((d) => d.id === args.deliveryId);
    if (!delivery) throw new NotFoundException('指定された配信が見つかりません。');

    if (delivery.channel === DeliveryChannel.TWITTER) {
      const content = delivery.content as TwitterDeliveryContent;
      const account = await this.prisma.twitterAccount.findFirst({
        where: { tenantId: args.tenantId },
        orderBy: { createdAt: 'asc' },
      });
      if (!account) {
        await this.prisma.delivery.update({
          where: { id: delivery.id },
          data: { status: DeliveryStatus.FAILED, error: 'X アカウントが連携されていません。設定画面から連携してください。' },
        });
        throw new ForbiddenException('X アカウントが連携されていません。');
      }
      try {
        const result = await this.twitterClient.postTweet(account, content.text);
        await this.prisma.delivery.update({
          where: { id: delivery.id },
          data: {
            status: DeliveryStatus.SENT,
            sentAt: new Date(),
            externalRef: result.tweetId,
            executedById: args.userId,
            error: null,
          },
        });
      } catch (err) {
        const message = err instanceof TwitterApiError ? err.userMessage : 'X 投稿で予期しないエラーが発生しました。';
        await this.prisma.delivery.update({
          where: { id: delivery.id },
          data: { status: DeliveryStatus.FAILED, error: message, executedById: args.userId },
        });
        throw err;
      }
    } else if (delivery.channel === DeliveryChannel.BLOG) {
      const content = delivery.content as BlogDeliveryContent;
      const post = await this.prisma.blogPost.update({
        where: { id: content.blogPostId },
        data: { publishedAt: new Date() },
      });
      await this.prisma.delivery.update({
        where: { id: delivery.id },
        data: {
          status: DeliveryStatus.SENT,
          sentAt: new Date(),
          externalRef: post.id,
          executedById: args.userId,
          error: null,
        },
      });
    }

    // 全 Delivery が SENT なら Announcement.status = DONE、それ以外なら EXECUTING
    const refreshed = await this.prisma.announcement.findFirstOrThrow({
      where: { id: args.announcementId },
      include: { deliveries: { select: { status: true } } },
    });
    const allSent = refreshed.deliveries.length > 0 && refreshed.deliveries.every((d) => d.status === DeliveryStatus.SENT);
    await this.prisma.announcement.update({
      where: { id: args.announcementId },
      data: { status: allSent ? AnnouncementStatus.DONE : AnnouncementStatus.EXECUTING },
    });

    return this.getDetail(args.tenantId, args.projectId, args.announcementId);
  }

  /** slug 候補が重複していたら `-2`, `-3` ... を試す。 */
  private async findUniqueBlogSlug(
    tx: { blogPost: { findFirst: (args: unknown) => Promise<{ id: string } | null> } },
    tenantId: string,
    projectId: string,
    base: string,
  ): Promise<string> {
    let candidate = base || 'post';
    for (let i = 2; i < 50; i++) {
      const existing = await tx.blogPost.findFirst({
        where: { tenantId, projectId, slug: candidate },
      });
      if (!existing) return candidate;
      candidate = `${base}-${i}`;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}

/** title を kebab-case slug に変換(BlogPost.slug の自動生成)。 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
```

- [ ] **Step 3: type-check + build**

Run: `pnpm --filter @shipyard/api type-check && pnpm --filter @shipyard/api build`
Expected: エラーなし。

- [ ] **Step 4: コミット**

```bash
git add apps/api/src/announcements/announcement.service.ts apps/api/src/announcements/dto/
git commit -m "feat(api): AnnouncementService(CRUD + generate + executeDelivery)+ DTO 3(ADR-014 Day 57)"
```

---

### Task 13: AnnouncementController(7 endpoints + 認可マトリクス)+ Module

**Files:**
- Create: `apps/api/src/announcements/announcement.controller.ts`
- Create: `apps/api/src/announcements/announcement.module.ts`

- [ ] **Step 1: announcement.controller.ts を作成**

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles } from '../auth/roles.decorator';
import { WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { AnnouncementService } from './announcement.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { GenerateAnnouncementDto } from './dto/generate-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Controller('workspaces/:slug/projects/:projectId/announcements')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class AnnouncementController {
  constructor(private readonly service: AnnouncementService) {}

  @Post()
  @Roles(...WRITER_ROLES)
  async create(
    @CurrentWorkspace() ws: { id: string },
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.service.create(ws.id, projectId, user.id, dto);
  }

  @Get()
  async list(@CurrentWorkspace() ws: { id: string }, @Param('projectId') projectId: string) {
    return this.service.list(ws.id, projectId);
  }

  @Get(':id')
  async get(
    @CurrentWorkspace() ws: { id: string },
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.getDetail(ws.id, projectId, id);
  }

  @Patch(':id')
  @Roles(...WRITER_ROLES)
  async update(
    @CurrentWorkspace() ws: { id: string },
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.service.update(ws.id, projectId, id, dto);
  }

  @Delete(':id')
  @Roles(...WRITER_ROLES)
  async delete(
    @CurrentWorkspace() ws: { id: string },
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.delete(ws.id, projectId, id);
  }

  @Post(':id/generate')
  @Roles(...WRITER_ROLES)
  async generate(
    @CurrentWorkspace() ws: { id: string; plan: 'FREE' | 'PRO' | 'TEAM' },
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: GenerateAnnouncementDto,
  ) {
    return this.service.generate({
      tenantId: ws.id,
      projectId,
      id,
      userId: user.id,
      plan: ws.plan,
      dto,
    });
  }

  @Post(':id/deliveries/:deliveryId/execute')
  @Roles(...WRITER_ROLES)
  async execute(
    @CurrentWorkspace() ws: { id: string },
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.service.executeDelivery({
      tenantId: ws.id,
      projectId,
      announcementId: id,
      deliveryId,
      userId: user.id,
    });
  }
}
```

- [ ] **Step 2: announcement.module.ts を作成**

```typescript
import { Module } from '@nestjs/common';

import { AIUsageModule } from '../ai/ai-usage.module';
import { AnthropicModule } from '../ai/anthropic.module';
import { IntegrationsTwitterModule } from '../integrations/twitter/integrations-twitter.module';
import { AnnouncementController } from './announcement.controller';
import { AnnouncementGenService } from './announcement-gen.service';
import { AnnouncementService } from './announcement.service';

@Module({
  imports: [AIUsageModule, AnthropicModule, IntegrationsTwitterModule],
  controllers: [AnnouncementController],
  providers: [AnnouncementGenService, AnnouncementService],
  exports: [AnnouncementService],
})
export class AnnouncementModule {}
```

(`AIUsageModule` / `AnthropicModule` の実名は既存に合わせて要確認。`AIUsageService` がどのモジュールから export されているかを確認して合わせる。)

- [ ] **Step 3: app.module.ts に AnnouncementModule を登録**

`apps/api/src/app.module.ts` の `imports` に `AnnouncementModule` を追加。

- [ ] **Step 4: type-check + build**

Run: `pnpm --filter @shipyard/api type-check && pnpm --filter @shipyard/api build`
Expected: エラーなし。

- [ ] **Step 5: コミット**

```bash
git add apps/api/src/announcements/announcement.controller.ts apps/api/src/announcements/announcement.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): AnnouncementController(7 endpoints + 認可マトリクス)+ Module(ADR-014 Day 57)"
```

---

### Task 14: E2E 実行 + 結果サマリ

**Files:**
- Create: `.claude/output/run-e2e/2026-MM-DD-day57-announcement-be.md`

- [ ] **Step 1: `/run-e2e` skill 起動 or 手動 E2E**

実 Anthropic API + 実 DB で以下シナリオを実行(`docs/superpowers/specs/2026-05-28-multi-channel-publishing-design.md` §6 のテスト戦略を参照):

- Announcement CRUD(POST + GET list + GET detail + PATCH + DELETE)
- `POST /announcements/:id/generate`(topic 指定 → twitter + blog 両 Delivery が作成、AIUsage 記録、Announcement.status = READY)
- `POST /generate?channels=TWITTER` 部分再生成(Blog Delivery は変わらず、Twitter のみ更新)
- Free プランで generate → 403
- 認可:VIEWER で GET 可 / POST 403、別テナントの id で 404
- Blog Delivery 実行(`POST /execute`)→ BlogPost.publishedAt セット + Delivery.status=SENT
- Blog の slug 衝突 → 409
- Twitter Delivery 実行 = **テスト用 X アカウント連携前**は 403「X アカウントが連携されていません」(連携後の実 tweet 投稿は手動 E2E で Day 59)

- [ ] **Step 2: 結果サマリを .claude/output に保存**

ファイル名:`.claude/output/run-e2e/2026-MM-DD-day57-announcement-be.md`
内容:シナリオ別 PASS/FAIL + AIUsage 記録件数 + コスト集計 + 既知の手動確認事項。

- [ ] **Step 3: セルフレビュー(`/reviewing-own-changes`)**

`code-reviewer` agent + `security-reviewer` agent を並列起動して指摘を反映:

- TokenEncryptionService の `getOrThrow` で env 名がエラーメッセージに漏れていないか
- Service 層のログで token 文字列が出力されていないか
- `safeHref` が Tweet text 中 URL に適用されているか(MVP は AI 出力をそのまま投稿するが、ユーザー編集で URL を入れる余地ありの認識)
- 403/404/409 の使い分け統一

- [ ] **Step 4: コミット(セルフレビュー指摘反映があれば)**

```bash
git add apps/api/src/
git commit -m "fix(api): セルフレビュー指摘反映(ADR-014 Day 57)"
```

---

## Day 58:FE 編集動線

### Task 15: API クライアント型 + 関数

**Files:**
- Modify: `apps/web/src/lib/api/types.ts`
- Modify: `apps/web/src/lib/api/workspaces.ts`

- [ ] **Step 1: types.ts に Announcement / Delivery / BlogPost / TwitterAccount 型追加**

`apps/web/src/lib/api/types.ts` の末尾に追加:

```typescript
export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'READY', 'EXECUTING', 'DONE'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const DELIVERY_CHANNELS = ['TWITTER', 'BLOG'] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export const DELIVERY_STATUSES = ['DRAFT', 'SCHEDULED', 'SENT', 'FAILED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export type TwitterDeliveryContent = { text: string };
export type BlogDeliveryContent = { blogPostId: string; summary: string };

export type Delivery = {
  id: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  content: TwitterDeliveryContent | BlogDeliveryContent;
  scheduledAt: string | null;
  sentAt: string | null;
  executedById: string | null;
  externalRef: string | null;
  error: string | null;
};

export type AnnouncementListItem = {
  id: string;
  title: string;
  status: AnnouncementStatus;
  createdAt: string;
  deliveries: Array<{ channel: DeliveryChannel; status: DeliveryStatus }>;
};

export type AnnouncementDetail = {
  id: string;
  title: string;
  status: AnnouncementStatus;
  createdAt: string;
  updatedAt: string;
  deliveries: Delivery[];
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  body: string;
  publishedAt: string | null;
  deliveryId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicBlogPost = {
  title: string;
  body: string;
  publishedAt: string;
  slug: string;
  project: { name: string; id: string };
  tenant: { slug: string };
};

export type TwitterAccountSummary = {
  id: string;
  handle: string;
  xUserId: string;
  connectedById: string;
  expiresAt: string;
  createdAt: string;
  scopes: string[];
};
```

- [ ] **Step 2: workspaces.ts に API 関数追加**

`apps/web/src/lib/api/workspaces.ts` の末尾に追加(既存 `apiFetch` ヘルパーに合わせる):

```typescript
// Announcement
export async function listAnnouncements(slug: string, projectId: string) {
  return apiFetch<{ items: AnnouncementListItem[] }>(
    `/workspaces/${slug}/projects/${projectId}/announcements`,
  );
}

export async function fetchAnnouncement(slug: string, projectId: string, id: string) {
  return apiFetch<AnnouncementDetail>(
    `/workspaces/${slug}/projects/${projectId}/announcements/${id}`,
  );
}

export async function createAnnouncement(slug: string, projectId: string, body: { title: string }) {
  return apiFetch<AnnouncementDetail>(
    `/workspaces/${slug}/projects/${projectId}/announcements`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function updateAnnouncement(
  slug: string, projectId: string, id: string,
  body: { title?: string; twitterContent?: { text: string } },
) {
  return apiFetch<AnnouncementDetail>(
    `/workspaces/${slug}/projects/${projectId}/announcements/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export async function deleteAnnouncement(slug: string, projectId: string, id: string) {
  return apiFetch<{ ok: true }>(
    `/workspaces/${slug}/projects/${projectId}/announcements/${id}`,
    { method: 'DELETE' },
  );
}

export async function generateAnnouncement(
  slug: string, projectId: string, id: string,
  body: { topic: string; channels?: DeliveryChannel[] },
) {
  return apiFetch<AnnouncementDetail>(
    `/workspaces/${slug}/projects/${projectId}/announcements/${id}/generate`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function executeDelivery(
  slug: string, projectId: string, announcementId: string, deliveryId: string,
) {
  return apiFetch<AnnouncementDetail>(
    `/workspaces/${slug}/projects/${projectId}/announcements/${announcementId}/deliveries/${deliveryId}/execute`,
    { method: 'POST' },
  );
}

// BlogPost
export async function fetchBlogPost(slug: string, projectId: string, id: string) {
  return apiFetch<BlogPost>(
    `/workspaces/${slug}/projects/${projectId}/blog-posts/${id}`,
  );
}

export async function listBlogPosts(slug: string, projectId: string) {
  return apiFetch<{ posts: BlogPost[] }>(
    `/workspaces/${slug}/projects/${projectId}/blog-posts`,
  );
}

export async function updateBlogPost(
  slug: string, projectId: string, id: string,
  body: { title?: string; body?: string; slug?: string; published?: boolean },
) {
  return apiFetch<BlogPost>(
    `/workspaces/${slug}/projects/${projectId}/blog-posts/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export async function fetchPublicBlogPost(slug: string, projectId: string, postSlug: string) {
  return apiFetch<PublicBlogPost>(
    `/public/blog-posts/${slug}/${projectId}/${postSlug}`,
    { method: 'GET', publicEndpoint: true } as { method: string; publicEndpoint: boolean },
  );
}

// Twitter integrations
export async function listTwitterAccounts(slug: string) {
  return apiFetch<{ accounts: TwitterAccountSummary[] }>(
    `/workspaces/${slug}/integrations/twitter`,
  );
}

export async function disconnectTwitterAccount(slug: string, accountId: string) {
  return apiFetch<{ ok: true }>(
    `/workspaces/${slug}/integrations/twitter/${accountId}`,
    { method: 'DELETE' },
  );
}
```

(注:`apiFetch` の正確な signature と `publicEndpoint` フラグの扱いは既存実装に合わせて調整。LP 公開 API の取り方を踏襲する。)

- [ ] **Step 3: type-check**

Run: `pnpm --filter @shipyard/web type-check`
Expected: エラーなし。

- [ ] **Step 4: コミット**

```bash
git add apps/web/src/lib/api/
git commit -m "feat(web): Announcement / Delivery / BlogPost / TwitterAccount API クライアント(ADR-014 Day 58)"
```

---

### Task 16: Announcement 一覧ページ + 新規ダイアログ + Project Card 追加

**Files:**
- Create: `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/page.tsx`
- Create: `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_components/new-announcement-dialog.tsx`
- Create: `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_actions/announcements.ts`
- Modify: `apps/web/src/app/w/[slug]/projects/[projectId]/page.tsx`

- [ ] **Step 1: `_actions/announcements.ts` を作成**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAnnouncement, generateAnnouncement, executeDelivery, updateAnnouncement, deleteAnnouncement } from '@/lib/api/workspaces';
import { classifyAiApiError } from '@/lib/ai-form';

export async function createAnnouncementAction(slug: string, projectId: string, formData: FormData) {
  const title = formData.get('title');
  if (typeof title !== 'string' || title.trim().length === 0) {
    return { error: 'タイトルを入力してください。' };
  }
  const created = await createAnnouncement(slug, projectId, { title: title.trim() });
  revalidatePath(`/w/${slug}/projects/${projectId}/announcements`);
  redirect(`/w/${slug}/projects/${projectId}/announcements/${created.id}`);
}

export async function generateAnnouncementAction(
  slug: string, projectId: string, id: string,
  formData: FormData,
) {
  const topic = formData.get('topic');
  const channelsRaw = formData.getAll('channels').map(String) as Array<'TWITTER' | 'BLOG'>;
  if (typeof topic !== 'string' || topic.trim().length === 0) {
    return { error: 'トピックを入力してください。' };
  }
  try {
    await generateAnnouncement(slug, projectId, id, {
      topic: topic.trim(),
      channels: channelsRaw.length > 0 ? channelsRaw : undefined,
    });
    revalidatePath(`/w/${slug}/projects/${projectId}/announcements/${id}`);
    return { ok: true };
  } catch (err) {
    return { error: classifyAiApiError(err) };
  }
}

export async function updateAnnouncementAction(
  slug: string, projectId: string, id: string,
  body: { title?: string; twitterContent?: { text: string } },
) {
  await updateAnnouncement(slug, projectId, id, body);
  revalidatePath(`/w/${slug}/projects/${projectId}/announcements/${id}`);
  return { ok: true };
}

export async function deleteAnnouncementAction(slug: string, projectId: string, id: string) {
  await deleteAnnouncement(slug, projectId, id);
  revalidatePath(`/w/${slug}/projects/${projectId}/announcements`);
  redirect(`/w/${slug}/projects/${projectId}/announcements`);
}

export async function executeDeliveryAction(
  slug: string, projectId: string, announcementId: string, deliveryId: string,
) {
  await executeDelivery(slug, projectId, announcementId, deliveryId);
  revalidatePath(`/w/${slug}/projects/${projectId}/announcements/${announcementId}`);
  return { ok: true };
}
```

(注:`classifyAiApiError` の場所は既存に合わせて import。Day 23 で確立した `_shared/ai-form.ts` を参照。)

- [ ] **Step 2: `_components/new-announcement-dialog.tsx` を作成**

shadcn/ui の `Dialog` を使い、`title` 入力 → `createAnnouncementAction`(Server Action)。失敗時 inline エラー、成功時に編集ページへ redirect される(Server Action 側で `redirect()`)。`useActionState` パターンで pending 表示。

(コードは Day 19 の `NewProjectDialog` 等を参照、既存パターンを忠実に踏襲)

- [ ] **Step 3: 一覧ページ `page.tsx` を作成(Server Component)**

```typescript
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Megaphone } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchProject, fetchWorkspace, listAnnouncements } from '@/lib/api/workspaces';
import { formatDateTime } from '@/lib/format';
import { isWriterRole } from '@/lib/api/types';

import { NewAnnouncementDialog } from './_components/new-announcement-dialog';

export default async function AnnouncementsPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;
  const [workspace, project, listing] = await Promise.all([
    fetchWorkspace(slug),
    fetchProject(slug, projectId),
    listAnnouncements(slug, projectId),
  ]);
  if (!workspace || !project) notFound();
  const canWrite = isWriterRole(workspace.role);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={`/w/${slug}/projects/${projectId}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {project.name} の詳細へ戻る
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Megaphone className="size-5" aria-hidden="true" />
            告知配信
          </h1>
          {canWrite && <NewAnnouncementDialog slug={slug} projectId={projectId} />}
        </div>
        <p className="text-muted-foreground text-sm">
          1 つの告知を Twitter とブログに同時配信できます。
        </p>
      </div>

      {listing.items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            最初の告知を作って、Twitter とブログに同時配信しましょう。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {listing.items.map((item) => (
            <Link
              key={item.id}
              href={`/w/${slug}/projects/${projectId}/announcements/${item.id}`}
              className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
            >
              <Card className="hover:bg-accent/30 h-full transition-colors">
                <CardHeader className="gap-2">
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    {item.deliveries.map((d) => (
                      <Badge
                        key={d.channel}
                        variant={d.status === 'SENT' ? 'default' : d.status === 'FAILED' ? 'destructive' : 'secondary'}
                      >
                        {d.channel === 'TWITTER' ? 'Twitter' : 'Blog'}:{d.status}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-muted-foreground text-xs">作成 {formatDateTime(item.createdAt)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Project 詳細ページに「告知配信」 Card を追加**

`apps/web/src/app/w/[slug]/projects/[projectId]/page.tsx` の Card グリッドに `LP` / `RAG_QA` / `診断` Card と並ぶ形で追加:

```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Megaphone className="size-5" />
      告知配信
    </CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-muted-foreground text-sm">Twitter とブログに一斉配信</p>
    <Link className="..." href={`/w/${slug}/projects/${projectId}/announcements`}>
      告知一覧へ
    </Link>
  </CardContent>
</Card>
```

- [ ] **Step 5: dev server 起動 + 手動確認**

Run: `pnpm --filter @shipyard/web dev`(別ターミナル)
ブラウザで `/w/{slug}/projects/{projectId}/announcements` を開き、新規ダイアログ → タイトル入力 → 編集ページ(まだ未実装)へ遷移することを確認。

- [ ] **Step 6: type-check + lint**

Run: `pnpm --filter @shipyard/web type-check && pnpm lint`
Expected: エラーなし。

- [ ] **Step 7: コミット**

```bash
git add apps/web/src/app/w/
git commit -m "feat(web): Announcement 一覧ページ + 新規ダイアログ + Project Card(ADR-014 Day 58)"
```

---

### Task 17: Announcement 編集ページ(Twitter / Blog タブ + 生成 + 実行)

**Files:**
- Create: `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/[id]/page.tsx`
- Create: `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_shared/announcement-form.ts`
- Create: `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_components/announcement-generate-dialog.tsx`
- Create: `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_components/twitter-content-editor.tsx`
- Create: `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_components/blog-content-editor.tsx`
- Create: `apps/web/src/app/w/[slug]/projects/[projectId]/announcements/_components/delivery-execute-button.tsx`

- [ ] **Step 1: `_shared/announcement-form.ts` を作成**

```typescript
export const TWITTER_TEXT_MAX = 280;
export const BLOG_TITLE_MAX = 120;
export const BLOG_BODY_MIN = 100;
export const ANNOUNCEMENT_TOPIC_MAX = 500;
```

(BE 側 `apps/api/src/announcements/announcement.constants.ts` と同期、定数の意味コメントも合わせる)

- [ ] **Step 2: `_components/twitter-content-editor.tsx` を作成**

Client Component。textarea で text 編集、文字数カウンタ(280 - text.length 表示、超過時赤字 + disabled)、Server Action `updateAnnouncementAction({ twitterContent: { text } })` を debounce で呼ぶ(or 「保存」 ボタン)。

- [ ] **Step 3: `_components/blog-content-editor.tsx` を作成**

Client Component。title / Markdown body / slug を編集、`updateBlogPost` API を呼ぶ。プレビューは `MarkdownViewer`(既存 `apps/web/src/components/markdown-viewer.tsx`)。

- [ ] **Step 4: `_components/announcement-generate-dialog.tsx` を作成**

Client Component。「AI で生成」 ボタン → Dialog 開く → topic textarea + channels checkbox + 「生成する」 ボタン(`generateAnnouncementAction` を `useActionState` で呼ぶ)。Pending 時「Sonnet 4 で生成中(10〜20 秒)」、成功時 Dialog 閉じる + revalidate、失敗時 `classifyAiApiError` で分類 + 表示。

- [ ] **Step 5: `_components/delivery-execute-button.tsx` を作成**

Client Component。「ツイート実行」 or 「ブログを公開」 ボタン(channel に応じてラベル変更)、`useOptimistic` で「実行中」 表示、`executeDeliveryAction` 呼び出し、成功時 Delivery.status 更新表示、失敗時 toast + 再実行可。

- [ ] **Step 6: 編集ページ `[id]/page.tsx` を作成(Server Component)**

トップヘッダ(title 表示 + 「AI で生成」 ダイアログ起動 + Announcement.status バッジ)、Twitter タブ + Blog タブ(shadcn/ui の `Tabs`)、各タブ内に Editor + Execute Button、下部に Delivery ステータスパネル(status / sentAt / externalRef link / error)。

擬似コード:

```tsx
export default async function AnnouncementDetailPage({ params }) {
  const { slug, projectId, id } = await params;
  const [workspace, announcement] = await Promise.all([
    fetchWorkspace(slug),
    fetchAnnouncement(slug, projectId, id),
  ]);
  if (!workspace || !announcement) notFound();
  const canWrite = isWriterRole(workspace.role);

  const twitter = announcement.deliveries.find((d) => d.channel === 'TWITTER');
  const blog = announcement.deliveries.find((d) => d.channel === 'BLOG');
  const blogPost = blog ? await fetchBlogPost(slug, projectId, (blog.content as BlogDeliveryContent).blogPostId) : null;

  return (
    <div className="space-y-6">
      <header>{/* タイトル + status バッジ + 生成ダイアログ */}</header>
      <Tabs defaultValue="twitter">
        <TabsList>
          <TabsTrigger value="twitter">Twitter</TabsTrigger>
          <TabsTrigger value="blog">Blog</TabsTrigger>
        </TabsList>
        <TabsContent value="twitter">
          {twitter ? (
            <>
              <TwitterContentEditor slug={slug} projectId={projectId} announcementId={id} initial={(twitter.content as TwitterContent).text} disabled={!canWrite} />
              <DeliveryExecuteButton slug={slug} projectId={projectId} announcementId={id} delivery={twitter} disabled={!canWrite} channelLabel="ツイート実行" />
            </>
          ) : <EmptyState label="まだ生成されていません。AI で生成をクリック" />}
        </TabsContent>
        <TabsContent value="blog">
          {blog && blogPost ? (
            <>
              <BlogContentEditor slug={slug} projectId={projectId} announcementId={id} initial={blogPost} disabled={!canWrite} />
              <DeliveryExecuteButton ... channelLabel="ブログを公開" />
            </>
          ) : <EmptyState label="まだ生成されていません" />}
        </TabsContent>
      </Tabs>
      <DeliveryStatusPanel deliveries={announcement.deliveries} slug={slug} projectId={projectId} />
    </div>
  );
}
```

- [ ] **Step 7: 手動確認(dev server)**

ブラウザで一覧 → 新規作成 → 編集ページ。AI 生成 → Twitter / Blog タブで内容確認 → 編集 → 実行(Twitter は X 連携前なので 403 表示 / Blog は publishedAt セットで成功)。

- [ ] **Step 8: type-check + lint**

Run: `pnpm --filter @shipyard/web type-check && pnpm lint`
Expected: エラーなし。

- [ ] **Step 9: コミット**

```bash
git add apps/web/src/app/w/
git commit -m "feat(web): Announcement 編集ページ(Twitter/Blog タブ + 生成 + 実行)(ADR-014 Day 58)"
```

---

## Day 59:FE 連携 + 公開ページ + 公開

### Task 18: 設定タブ「連携」 + Twitter UI

**Files:**
- Create: `apps/web/src/app/w/[slug]/settings/integrations/page.tsx`
- Modify: `apps/web/src/app/w/[slug]/settings/layout.tsx`(or 等価のタブナビ実装ファイル)

- [ ] **Step 1: 既存タブ実装を Read で確認**

`apps/web/src/app/w/[slug]/settings/` 配下を `ls`、タブ実装が layout.tsx か Sub-nav か確認。

- [ ] **Step 2: タブ定義に `integrations` を追加**

ナビゲーション項目に「連携」 を追加。href = `/w/${slug}/settings/integrations`。

- [ ] **Step 3: `integrations/page.tsx` を作成(Server Component)**

```tsx
import { notFound } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchWorkspace, listTwitterAccounts } from '@/lib/api/workspaces';
import { formatDateTime } from '@/lib/format';

import { DisconnectTwitterButton } from './_components/disconnect-twitter-button';

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [workspace, listing] = await Promise.all([
    fetchWorkspace(slug),
    listTwitterAccounts(slug),
  ]);
  if (!workspace) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">連携</h1>
      <Card>
        <CardHeader>
          <CardTitle>X (Twitter)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {listing.accounts.length === 0 ? (
            <p className="text-muted-foreground text-sm">まだ連携されていません。</p>
          ) : (
            <ul className="space-y-2">
              {listing.accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <p className="font-medium">@{a.handle}</p>
                    <p className="text-muted-foreground text-xs">
                      期限 {formatDateTime(a.expiresAt)}
                    </p>
                  </div>
                  <DisconnectTwitterButton slug={slug} accountId={a.id} />
                </li>
              ))}
            </ul>
          )}
          {/* OAuth 開始は GET なので a タグで遷移(Server Action 不可) */}
          <Button asChild>
            <a href={`/api/workspaces/${slug}/integrations/twitter/authorize`}>X アカウントを連携する</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

(`/api/workspaces/.../authorize` のパス変換は既存の `apiFetch` route ハンドラ慣習に合わせる。直接 BE エンドポイントに飛ばすなら絶対 URL `${NEXT_PUBLIC_API_BASE_URL}/workspaces/...` を使う。)

- [ ] **Step 4: `_components/disconnect-twitter-button.tsx` を作成**

確認モーダル + `disconnectTwitterAccountAction`(Server Action)。

- [ ] **Step 5: 手動確認**

`/w/{slug}/settings/integrations` を開き、連携ボタン → X 認可画面(local では X dev tunnel 設定が必要、別途 runbook で記載)→ 戻り → 連携済リスト表示。

- [ ] **Step 6: type-check + lint**

Run: `pnpm --filter @shipyard/web type-check && pnpm lint`
Expected: エラーなし。

- [ ] **Step 7: コミット**

```bash
git add apps/web/src/app/w/[slug]/settings/
git commit -m "feat(web): 設定タブ「連携」 + Twitter UI(ADR-014 Day 59)"
```

---

### Task 19: 公開ブログページ(`/p/[slug]/[projectId]/blog/[postSlug]`)

**Files:**
- Create: `apps/web/src/app/p/[slug]/[projectId]/blog/[postSlug]/page.tsx`
- Create: `apps/web/src/app/p/[slug]/[projectId]/blog/[postSlug]/error.tsx`

- [ ] **Step 1: 公開 LP ページのレイアウトを Read で確認**

`apps/web/src/app/p/[slug]/[projectId]/page.tsx` を読み、ヘッダ / フッタ / generateMetadata パターンを確認。

- [ ] **Step 2: 公開ブログページ `page.tsx` を作成**

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MarkdownViewer } from '@/components/markdown-viewer';
import { fetchPublicBlogPost } from '@/lib/api/workspaces';
import { formatDateTime } from '@/lib/format';

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; projectId: string; postSlug: string }>;
}): Promise<Metadata> {
  const { slug, projectId, postSlug } = await params;
  try {
    const post = await fetchPublicBlogPost(slug, projectId, postSlug);
    const canonical = `${APP_BASE_URL}/p/${slug}/${projectId}/blog/${postSlug}`;
    return {
      title: `${post.title} - ${post.project.name}`,
      description: post.body.slice(0, 120).replace(/\n/g, ' '),
      alternates: { canonical },
      openGraph: { title: post.title, description: post.body.slice(0, 120), url: canonical, type: 'article' },
      twitter: { card: 'summary_large_image', title: post.title, description: post.body.slice(0, 120) },
    };
  } catch {
    return { title: '記事が見つかりません' };
  }
}

export default async function PublicBlogPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string; postSlug: string }>;
}) {
  const { slug, projectId, postSlug } = await params;
  let post;
  try {
    post = await fetchPublicBlogPost(slug, projectId, postSlug);
  } catch {
    notFound();
  }

  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <header className="space-y-2">
        <a href={`/p/${slug}/${projectId}`} className="text-muted-foreground text-sm hover:underline">
          ← {post.project.name} のトップへ
        </a>
        <h1 className="text-3xl font-bold">{post.title}</h1>
        <time className="text-muted-foreground text-sm">
          公開 {formatDateTime(post.publishedAt)}
        </time>
      </header>
      <MarkdownViewer source={post.body} />
      <footer className="text-muted-foreground border-t pt-4 text-xs">
        Powered by Shipyard
      </footer>
    </article>
  );
}
```

- [ ] **Step 3: `error.tsx` を作成(LP 公開ページの error.tsx を参考)**

LP の `apps/web/src/app/p/[slug]/[projectId]/error.tsx` を Read して同パターンで:

```tsx
'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-center">
      <h1 className="text-xl font-semibold">記事を表示できませんでした</h1>
      <p className="text-muted-foreground mt-2 text-sm">{error.message}</p>
      <button onClick={() => reset()} className="mt-4 underline">再読み込み</button>
    </div>
  );
}
```

- [ ] **Step 4: middleware の publicRoutes を確認**

`apps/web/src/middleware.ts` を Read。既に `/p/(.*)` が publicRoutes に入っているはず(LP 公開で済み)。入っていなければ追加。

- [ ] **Step 5: robots.ts + sitemap.ts を確認 / 追加**

`apps/web/src/app/robots.ts` / `sitemap.ts` が存在するか確認:
- 存在しない → `robots.ts` を新規作成し、`/p/*` allow + `/w/*` Disallow を設定
- 存在する → `/p/*` allow が含まれているか確認、無ければ追加

```tsx
// apps/web/src/app/robots.ts(新規 or 編集)
import type { MetadataRoute } from 'next';

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: ['/p/'], disallow: ['/w/', '/api/'] },
    ],
    sitemap: `${APP_BASE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 6: 手動確認**

実 BlogPost を 1 件作って publishedAt をセット、ブラウザで `/p/{slug}/{projectId}/blog/{postSlug}` を開き表示確認。Chrome / Safari / モバイル Safari + OG プレビュー(`https://www.opengraph.xyz/`)。

- [ ] **Step 7: type-check + lint**

Run: `pnpm --filter @shipyard/web type-check && pnpm lint`
Expected: エラーなし。

- [ ] **Step 8: コミット**

```bash
git add apps/web/src/app/p/ apps/web/src/app/robots.ts
git commit -m "feat(web): 公開ブログページ(/p/[slug]/[projectId]/blog/[postSlug])+ robots(ADR-014 Day 59)"
```

---

### Task 20: Twitter 連携 運用 runbook 作成

**Files:**
- Create: `docs/runbooks/twitter-integration-troubleshooting.md`

- [ ] **Step 1: runbook を作成(Day 49 Clerk webhook runbook と同形式)**

`docs/runbooks/clerk-webhook-troubleshooting.md` を参考に、以下のセクションで構成:

1. **概要**:Twitter 連携の全体像、関連実装ファイル一覧
2. **ローカルセットアップ手順**:Twitter Developer App 作成 + Callback URL 設定 + .env.local 設定 + `openssl rand -base64 32` で master key 生成
3. **本番セットアップ手順**:本番 App 申請 + Secrets Manager 投入 + Callback URL 本番 URL 追加
4. **既知事象(7 件)**:
   - state 期限切れ(5 分超)→ 400「リンクが無効」
   - scope 不足(`tweet.write` / `offline.access` を Developer App で有効化していない)
   - refresh token 失効(60 日無使用 or revoke)→ 再連携必要
   - X アカウントサスペンド → 403、ユーザー側で X 規約確認が必要
   - rate limit 429 → 月 1500 投稿(Free Tier)を超過、翌月リセット
   - 暗号化 key 不一致(master key を変更後の既存 token は復号失敗)→ 再連携必要(v1.x で再暗号化バッチ実装)
   - callback URL 不一致 → X Developer App の Callback URLs に local/staging/prod 全て登録要
5. **デバッグ SQL**:
   - 直近 Delivery 失敗:`SELECT id, channel, status, error, "sentAt" FROM "Delivery" WHERE status = 'FAILED' ORDER BY "sentAt" DESC LIMIT 10;`
   - TwitterAccount 一覧:`SELECT id, handle, "expiresAt", "createdAt" FROM "TwitterAccount" WHERE "tenantId" = '{tenantId}';`
   - 期限間近抽出:`SELECT id, handle, "expiresAt" FROM "TwitterAccount" WHERE "expiresAt" < NOW() + INTERVAL '1 day';`

- [ ] **Step 2: コミット**

```bash
git add docs/runbooks/twitter-integration-troubleshooting.md
git commit -m "docs: Twitter 連携 運用 runbook 作成(ADR-014 Day 59)"
```

---

### Task 21: PROJECT_STATUS.md 更新(Day 56-59 完了反映 + Day 化)

**Files:**
- Modify: `docs/PROJECT_STATUS.md`

- [ ] **Step 1: §11 変更履歴に Day 56-59 完了行を追加**

各 Day の deliverable をまとめた行を時系列順に追加:

```markdown
| 2026-MM-DD | **Day 56 完了:Announcement / Delivery / BlogPost / TwitterAccount schema + migration + Feature.ANNOUNCEMENT_GEN + TokenEncryptionService + assertWithinAnnouncementQuota**(ADR-014)。... |
| 2026-MM-DD | **Day 57 完了:AnnouncementGenService + TwitterAuth/Client + Controllers 4 × 計 15 endpoints + E2E**(ADR-014)。... |
| 2026-MM-DD | **Day 58 完了:Announcement FE(一覧 + 編集 + AI 生成 + Delivery 実行 UI)+ Project Card**(ADR-014)。... |
| 2026-MM-DD | **Day 59 完了:Twitter 連携 UI + 公開ブログページ + robots + runbook + 公開リリース**(ADR-014)。... |
```

- [ ] **Step 2: §9.11 進行状況を「全 Day 完了 + 公開済」 に更新**

- [ ] **Step 3: 冒頭「最終更新」 / 「現在のフェーズ」 を更新**

- [ ] **Step 4: コミット**

```bash
git add docs/PROJECT_STATUS.md
git commit -m "docs: Day 56-59 完了 + ADR-014 マルチチャネル告知配信を MVP 同梱で公開(ADR-014)"
```

---

### Task 22: 公開チェックリスト実行 + 公開リリース

**Files:**
- なし(運用作業)

- [ ] **Step 1: Spec doc §6 公開チェックリストの 8 項目を順次実施**

`docs/superpowers/specs/2026-05-28-multi-channel-publishing-design.md` §6 の公開チェックリスト:

1. Twitter Developer App 申請 + 承認(本番)
2. App の callback URL に prod / dev 両 URL を登録
3. `TWITTER_TOKEN_ENCRYPTION_KEY` を Secrets Manager に投入
4. `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` を Secrets Manager に投入
5. Upstash Redis(state 保管用)の prod インスタンス確認
6. 利用規約 update(投稿はユーザー責任)
7. `/p/.../blog/.*` を robots.txt で allow + sitemap に追加(Task 19 で対応済)
8. 公開後 24h で実 tweet × 1 / 実 blog × 1 を Shipyard 自身でドッグフーディング

各項目の完了を `docs/runbooks/adr-012-release-checklist.md` 等に転記(あれば)。

- [ ] **Step 2: main を origin に push(各 Day で push 済の場合は確認のみ)**

Run: `git push origin main`
Expected: 全コミットが origin/main に反映。

- [ ] **Step 3: App Runner に最新コンテナデプロイ(GitHub Actions が自動 trigger)**

`docs/runbooks/adr-012-release-checklist.md` 等の本番化手順に沿って、デプロイ完了 + ヘルスチェック確認。

- [ ] **Step 4: 公開後ドッグフーディング**

Shipyard 自身のプロジェクトで Announcement を 1 件作成 → 実 tweet 投稿 → 公開ブログ 1 件公開 → ユーザー視点で確認。

- [ ] **Step 5: 公開アナウンス**

Day 52-53 で準備した Zenn 記事 + Twitter 告知を実行(本機能を使って告知すれば最高のドッグフーディング)。

---

## ロールバック手順(緊急時)

- **Twitter API 障害が長引く場合**:`AnnouncementGenService.generate` で channels = ['BLOG'] のみに制限する hotfix を投入
- **Token 復号エラー多発**:master key 変更があった場合、全 `TwitterAccount` を DELETE してユーザーに再連携を促す
- **公開ブログページ DDoS**:Vercel Bot Protection を有効化 + 必要なら `/p/.*/blog/.*` に rate limit 設定

---

## 完了基準

- [ ] Day 56-59 のすべての Task が完了
- [ ] PROJECT_STATUS.md §11 変更履歴に Day 完了行が追加されている
- [ ] §9.11 進行状況が「全 Day 完了 + 公開済」 に更新されている
- [ ] 公開後 24 時間のドッグフーディング(実 tweet + 公開ブログ)が成功
- [ ] CloudWatch メトリクスで `announcement.generate` 成功率 > 90% / `delivery.execute` 成功率 > 95%(初動 1 週間)
