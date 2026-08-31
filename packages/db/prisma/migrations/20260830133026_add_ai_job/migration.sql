-- ADR-017: 長時間 AI 処理の進行状態を持つ AiJob テーブルを追加。
-- プロダクト診断 / アイデア検証は 88〜113 秒かかり、Vercel Hobby の関数実行上限(60 秒)と
-- FE の API_TIMEOUT_MS(55 秒)を超えるため、同期実行では UI から完走できない。
-- 「実行を投げて結果は後から取得する」形にするための進行状態テーブル。
--
-- 注意(確立済みの運用ルール、Day 14 / 15 / 26 / 27 / 49 と同様):
--   - Prisma の drift 検出で出た `DROP INDEX "ProjectDocument_embedding_hnsw_idx"` は除去している
--     (HNSW インデックスは migrate dev が認識できず毎回 DROP を提案するため)。
--   - 一緒に提案された `ServiceScore_createdById_fkey` / `IdeaValidation_createdById_fkey` の
--     DropForeignKey + AddForeignKey の付け直しは**残している**。本 migration のスコープ外だが、
--     `migrate dev` が既に DB へ適用済みで、ここから消すとファイルが実態を記述しなくなり
--     次回以降ドリフト扱いになるため(実際に踏んだ)。除去したいなら `--create-only` で
--     生成し、適用前に編集すること。

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "feature" "Feature" NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'RUNNING',
    "resultId" TEXT,
    "errorMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiJob_tenantId_idx" ON "AiJob"("tenantId");

-- CreateIndex
CREATE INDEX "AiJob_tenantId_projectId_status_idx" ON "AiJob"("tenantId", "projectId", "status");

-- AddForeignKey
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey(上記の注意を参照。適用済みのため残している)
ALTER TABLE "ServiceScore" DROP CONSTRAINT "ServiceScore_createdById_fkey";
ALTER TABLE "ServiceScore" ADD CONSTRAINT "ServiceScore_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IdeaValidation" DROP CONSTRAINT "IdeaValidation_createdById_fkey";
ALTER TABLE "IdeaValidation" ADD CONSTRAINT "IdeaValidation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
