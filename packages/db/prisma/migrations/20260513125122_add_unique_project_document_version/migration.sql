-- 同一 (projectId, type) 内で version を一意にする(並行生成時の version 重複を DB レベルで防止)。
-- 既存の非一意インデックスを一意インデックスに置き換える。

-- DropIndex
DROP INDEX "ProjectDocument_projectId_type_version_idx";

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDocument_projectId_type_version_key" ON "ProjectDocument"("projectId", "type", "version");
