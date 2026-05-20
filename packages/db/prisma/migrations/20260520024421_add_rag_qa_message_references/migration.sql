-- NOTE: prisma migrate dev は schema に表現できない HNSW インデックス
-- (`ProjectDocument_embedding_hnsw_idx`、`20260508071200_add_hnsw_index` で raw SQL 管理)を
-- 「未知の index」 として毎回 `DROP INDEX` を生成しようとする(Day 14 / 15 / 26 / 27 で同問題)。
-- 本 migration では Prisma が自動生成した `DROP INDEX "ProjectDocument_embedding_hnsw_idx";` を
-- 手動で削除済み。今後の `prisma migrate dev` は必ず `--create-only` で生成し、DROP INDEX を
-- 取り除いてから apply すること(運用ルール)。

-- AlterTable
ALTER TABLE "RagQaMessage" ADD COLUMN     "references" JSONB;
