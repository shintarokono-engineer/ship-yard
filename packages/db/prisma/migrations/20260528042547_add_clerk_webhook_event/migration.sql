-- §9.10 Clerk webhook(Day 49)。
-- スコープ: User 論理削除カラム追加 + ClerkWebhookEvent テーブル新設。
-- 注意:
--   - Prisma の drift 検出で出た `DROP INDEX "ProjectDocument_embedding_hnsw_idx"` は除去している
--     (HNSW インデックスは prisma-erd-generator / migrate dev が認識できず毎回 DROP 提案するため、
--      ADR-005 改訂節 + Day 27 / Day 14 / Day 15 / Day 26 で確立済みの運用ルール)。
--   - Prisma が一緒に提案した `IdeaValidation_createdById_fkey` / `ServiceScore_createdById_fkey` の
--     DropForeignKey + AddForeignKey の付け直しも本 migration のスコープ外のため除去。

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClerkWebhookEvent" (
    "id" TEXT NOT NULL,
    "svixMessageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'PROCESSED',
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClerkWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClerkWebhookEvent_svixMessageId_key" ON "ClerkWebhookEvent"("svixMessageId");

-- CreateIndex
CREATE INDEX "ClerkWebhookEvent_type_processedAt_idx" ON "ClerkWebhookEvent"("type", "processedAt");
