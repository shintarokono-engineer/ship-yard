-- CreateEnum
CREATE TYPE "RagQaRole" AS ENUM ('USER', 'ASSISTANT');

-- NOTE: prisma migrate dev は schema に表現できない HNSW インデックス
-- (`ProjectDocument_embedding_hnsw_idx`、`20260508071200_add_hnsw_index` で raw SQL 管理)を
-- 「未知の index」 として毎回 `DROP INDEX` を生成しようとする(Day 14 / Day 15 / Day 26 で同問題、
-- ADR-005 line 67 の独自性コア = ベクトル検索が seq scan に劇遅化するリスク)。
-- 本 migration では Prisma が自動生成した `DROP INDEX "ProjectDocument_embedding_hnsw_idx";` を
-- 手動で削除済み。今後の `prisma migrate dev` でも同様の対処が必要(運用ルール化候補)。

-- CreateTable
CREATE TABLE "RagQaSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RagQaSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RagQaMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "RagQaRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RagQaMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RagQaSession_tenantId_idx" ON "RagQaSession"("tenantId");

-- CreateIndex
CREATE INDEX "RagQaSession_projectId_updatedAt_idx" ON "RagQaSession"("projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "RagQaMessage_tenantId_idx" ON "RagQaMessage"("tenantId");

-- CreateIndex
CREATE INDEX "RagQaMessage_sessionId_createdAt_idx" ON "RagQaMessage"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "RagQaSession" ADD CONSTRAINT "RagQaSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RagQaSession" ADD CONSTRAINT "RagQaSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RagQaSession" ADD CONSTRAINT "RagQaSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RagQaMessage" ADD CONSTRAINT "RagQaMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RagQaSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
