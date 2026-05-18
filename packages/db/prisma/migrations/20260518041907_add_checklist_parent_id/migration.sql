-- ChecklistItem に parentId(自己参照)を追加(Day 15、TASK_SPLIT)。
-- TASK_SPLIT で分解されたサブタスクが「どの親 ChecklistItem から作られたか」を構造的に保持する。
-- 手動作成された ChecklistItem では NULL のまま。親が削除されたら Cascade で子も消える(ユーザー選択)。
--
-- 注意: Prisma の `migrate dev --create-only` が「schema 未定義のインデックスを drop」と誤判定して
--       Day 12 の `ProjectDocument_embedding_hnsw_idx`(pgvector HNSW)を消そうとするため、
--       生成された migration から `DROP INDEX "ProjectDocument_embedding_hnsw_idx"` を**手作業で除去**している。
--       HNSW は schema.prisma で表現不可(preview feature でも非対応)なので、毎回同じ抑制が必要。

-- AlterTable
ALTER TABLE "ChecklistItem" ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "ChecklistItem_parentId_idx" ON "ChecklistItem"("parentId");

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
