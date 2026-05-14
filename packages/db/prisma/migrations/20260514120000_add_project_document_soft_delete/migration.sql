-- ProjectDocument に論理削除カラム deletedAt を追加(append-only ポリシー)。
-- 物理削除は行わず、削除時は UPDATE で deletedAt に UTC now を入れて非表示化する。
-- 一覧/取得は常に WHERE deletedAt IS NULL を付ける(漏れると削除済みが API に返る)。

-- AlterTable
ALTER TABLE "ProjectDocument" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex(projectId/type で絞ったあと deletedAt = NULL でフィルタする一覧クエリを支援)
CREATE INDEX "ProjectDocument_projectId_type_deletedAt_idx" ON "ProjectDocument"("projectId", "type", "deletedAt");
