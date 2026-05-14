-- 一覧クエリ(WHERE deletedAt IS NULL + projectId + type)を高速化する partial index。
-- partial index は WHERE deletedAt IS NULL の行だけを含むため:
--   1. インデックスサイズが生存行のみ分まで縮小(物理削除しない append-only テーブルで効く)
--   2. WHERE deletedAt IS NULL 付き SELECT のプランナー判断が明示的になる
--
-- Prisma schema は partial index を表現できないため raw SQL 管理(HNSW と同じパターン)。
-- 補足: 以後 `prisma migrate diff` がこの index を DROP すべきと判定するが、
--       その DROP 行は手作業で除外する。

-- DropIndex
DROP INDEX "ProjectDocument_projectId_type_deletedAt_idx";

-- CreateIndex(partial、WHERE deletedAt IS NULL)
CREATE INDEX "ProjectDocument_projectId_type_active_idx"
  ON "ProjectDocument" ("projectId", "type")
  WHERE "deletedAt" IS NULL;
