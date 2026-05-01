# データモデル設計

## 概要

Shipyard のデータモデルを定義する。マルチテナント前提のため、すべての業務テーブルに `tenantId` カラムを持たせる(ADR-002 参照)。`User` のみテナントに属さない例外。

## ER 図

```mermaid
erDiagram
    USER ||--o{ TENANT_MEMBER : "belongs to"
    TENANT ||--o{ TENANT_MEMBER : "has"
    TENANT ||--o{ PROJECT : "owns"
    TENANT ||--o| SUBSCRIPTION : "has"
    TENANT ||--o{ AI_USAGE : "tracks"
    TENANT ||--o{ INVITATION_TOKEN : "issues"
    PROJECT ||--o{ CHECKLIST_ITEM : "contains"
    PROJECT ||--o{ AI_DOCUMENT : "produces"
    USER ||--o{ AI_USAGE : "consumes"
    USER ||--o{ AI_DOCUMENT : "creates"

    USER {
        string id PK
        string clerkUserId UK
        string email
        string name
        string image
        datetime createdAt
    }
    TENANT {
        string id PK
        string slug UK
        string name
        Plan plan
        string ownerId FK
        datetime createdAt
    }
    TENANT_MEMBER {
        string tenantId PK_FK
        string userId PK_FK
        Role role
        datetime joinedAt
    }
    PROJECT {
        string id PK
        string tenantId FK
        string name
        string description
        ProjectStatus status
        datetime launchDate
        string createdById FK
        datetime createdAt
        datetime updatedAt
    }
    CHECKLIST_ITEM {
        string id PK
        string tenantId FK
        string projectId FK
        Category category
        string title
        string description
        ItemStatus status
        int position
        datetime createdAt
    }
    AI_DOCUMENT {
        string id PK
        string tenantId FK
        string projectId FK
        DocType type
        string title
        text content
        int version
        vector embedding
        string createdById FK
        datetime createdAt
    }
    AI_USAGE {
        string id PK
        string tenantId FK
        string userId FK
        string model
        Feature feature
        int tokensIn
        int tokensOut
        decimal costJpy
        datetime createdAt
    }
    SUBSCRIPTION {
        string id PK
        string tenantId FK_UK
        string stripeCustomerId UK
        string stripeSubId UK
        Plan plan
        SubStatus status
        datetime currentPeriodEnd
        datetime canceledAt
    }
    WEBHOOK_EVENT {
        string id PK
        string stripeEventId UK
        string type
        json payload
        WebhookStatus status
        datetime processedAt
    }
    INVITATION_TOKEN {
        string id PK
        string tenantId FK
        string email
        Role role
        string token UK
        datetime expiresAt
        datetime acceptedAt
        string invitedById FK
    }
```

## Prisma スキーマ

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector", schema: "public")]
}

// ============== Enums ==============

enum Plan {
  FREE
  PRO
  TEAM
}

enum Role {
  OWNER
  ADMIN
  DEVELOPER
  REVIEWER
  TESTER
  VIEWER
}

enum ProjectStatus {
  IDEA
  IN_DEV
  BETA
  LAUNCHED
  ARCHIVED
}

enum ItemStatus {
  TODO
  IN_PROGRESS
  DONE
  NOT_APPLICABLE
}

enum Category {
  TECH
  LEGAL
  MARKETING
  UX
  OTHER
}

enum DocType {
  README
  LANDING_PAGE
  RELEASE_BLOG
  TWEET
  PRODUCT_HUNT
  EMAIL
  OTHER
}

enum Feature {
  COMPETITOR_RESEARCH
  DRAFT_GEN
  TASK_SPLIT
  RAG_QA
  CHECKLIST_GEN
  OTHER
}

enum SubStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  INCOMPLETE
  TRIALING
}

enum WebhookStatus {
  PROCESSED
  FAILED
  RETRYING
}

// ============== Models ==============

model User {
  id           String   @id @default(cuid())
  clerkUserId  String   @unique
  email        String   @unique
  name         String?
  image        String?
  createdAt    DateTime @default(now())

  memberships  TenantMember[]
  ownedTenants Tenant[]         @relation("TenantOwner")
  documents    AIDocument[]
  usage        AIUsage[]
  invitations  InvitationToken[]
}

model Tenant {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  plan        Plan     @default(FREE)
  ownerId     String
  createdAt   DateTime @default(now())

  owner        User              @relation("TenantOwner", fields: [ownerId], references: [id])
  members      TenantMember[]
  projects     Project[]
  subscription Subscription?
  usage        AIUsage[]
  invitations  InvitationToken[]

  @@index([slug])
}

model TenantMember {
  tenantId  String
  userId    String
  role      Role     @default(DEVELOPER)
  joinedAt  DateTime @default(now())

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([tenantId, userId])
  @@index([userId])
}

model Project {
  id           String        @id @default(cuid())
  tenantId     String        // ← マルチテナント分離キー
  name         String
  description  String?       @db.Text
  status       ProjectStatus @default(IDEA)
  launchDate   DateTime?
  createdById  String
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  tenant       Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  checklist    ChecklistItem[]
  documents    AIDocument[]

  @@index([tenantId])
  @@index([tenantId, status])
}

model ChecklistItem {
  id           String     @id @default(cuid())
  tenantId     String     // ← 必須
  projectId    String
  category     Category
  title        String
  description  String?    @db.Text
  status       ItemStatus @default(TODO)
  position     Int        @default(0)
  createdAt    DateTime   @default(now())

  project      Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([projectId, position])
}

model AIDocument {
  id           String   @id @default(cuid())
  tenantId     String   // ← 必須
  projectId    String
  type         DocType
  title        String
  content      String   @db.Text
  version      Int      @default(1)
  embedding    Unsupported("vector(1536)")?
  createdById  String
  createdAt    DateTime @default(now())

  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdBy    User     @relation(fields: [createdById], references: [id])

  @@index([tenantId])
  @@index([projectId, type, version])
}

model AIUsage {
  id         String   @id @default(cuid())
  tenantId   String   // ← 必須
  userId     String
  model      String   // claude-sonnet-4-7 / claude-haiku-4-5-20251001 など
  feature    Feature
  tokensIn   Int
  tokensOut  Int
  costJpy    Decimal  @db.Decimal(10, 4)
  createdAt  DateTime @default(now())

  tenant     Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id])

  @@index([tenantId, createdAt])
  @@index([tenantId, feature, createdAt])
}

model Subscription {
  id                String     @id @default(cuid())
  tenantId          String     @unique
  stripeCustomerId  String     @unique
  stripeSubId       String?    @unique
  plan              Plan
  status            SubStatus  @default(ACTIVE)
  currentPeriodEnd  DateTime?
  canceledAt        DateTime?
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  tenant            Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model WebhookEvent {
  id              String        @id @default(cuid())
  stripeEventId   String        @unique  // Idempotency key
  type            String
  payload         Json
  status          WebhookStatus @default(PROCESSED)
  processedAt     DateTime      @default(now())

  @@index([type, processedAt])
}

model InvitationToken {
  id           String   @id @default(cuid())
  tenantId     String
  email        String
  role         Role     @default(DEVELOPER)
  token        String   @unique
  expiresAt    DateTime
  acceptedAt   DateTime?
  invitedById  String

  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  invitedBy    User     @relation(fields: [invitedById], references: [id])

  @@index([tenantId, email])
  @@index([token])
}
```

## インデックス戦略

### 基本方針

- すべての業務テーブルで `@@index([tenantId])` を必ず付与(マルチテナントクエリの効率化)
- 頻出検索パターンには複合インデックスを追加

### 主要なインデックス

| テーブル | インデックス | 用途 |
|---|---|---|
| Tenant | slug | サブパス `/w/{slug}` からの解決 |
| TenantMember | (tenantId, userId) PK | テナント所属チェック |
| TenantMember | userId | ユーザーの所属テナント一覧 |
| Project | (tenantId, status) | ダッシュボードでのステータス絞り込み |
| ChecklistItem | (projectId, position) | チェックリストの順序保証付き取得 |
| AIDocument | (projectId, type, version) | 文書タイプ別最新版取得 |
| AIUsage | (tenantId, createdAt) | 月次集計の高速化 |
| AIUsage | (tenantId, feature, createdAt) | 機能別の使用量分析 |

### pgvector インデックス

`AIDocument.embedding` には HNSW インデックスを別途 SQL マイグレーションで追加:

```sql
CREATE INDEX ON "AIDocument" USING hnsw (embedding vector_cosine_ops);
```

cosine 類似度を採用(text-embedding-3-small が L2 正規化済みのため)。

## マルチテナント整合性の担保

### Prisma Client Extension での自動 tenantId 注入

Service 層で `tenantId` を意識せず書ける仕組みを Day 5 で実装する。詳細は ADR-002 と前回のコード例を参照。

対象テーブル:

- Project, ChecklistItem, AIDocument, AIUsage, InvitationToken
- 対象外(テナントを持たない): User, WebhookEvent
- 別扱い(1対1): TenantMember, Subscription

### Raw SQL 利用時の規約

- 原則禁止
- やむを得ず使う場合は `WHERE tenantId = $1` を明示
- ESLint カスタムルール `no-raw-sql-without-tenant-filter` で検出する

## マイグレーション順序(Day 5 で実施)

1. PostgreSQL に pgvector 拡張をインストール
2. Enum 群を作成
3. User → Tenant → TenantMember(独立性の高いものから)
4. Project → ChecklistItem → AIDocument
5. AIUsage → Subscription → WebhookEvent → InvitationToken
6. インデックス作成(HNSW を含む)

## 開発時のシードデータ

最小限のシードデータをローカル開発用に用意する:

- ユーザー2人(自分 + テスト用ダミー)
- テナント2つ(個人ワークスペース + テスト用組織)
- プロジェクト3つ(IDEA / IN_DEV / LAUNCHED の各ステータス)
- チェックリスト項目10個(各カテゴリから2〜3個)
- AI ドキュメント2件(README v1 + LP v1)

## フォローアップ

- ユーザー削除時のデータ保持(GDPR 対応)を別途設計
- バックアップ・リストア戦略の文書化
- レプリカへの読み取り分散(将来)
