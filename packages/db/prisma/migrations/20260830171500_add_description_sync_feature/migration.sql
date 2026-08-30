-- Feature enum に DESCRIPTION_SYNC を追加。
-- 壁打ちセッションの要約による Project.description 更新を AIUsage の集計軸として区別する。
--
-- 注意: PostgreSQL の `ALTER TYPE ... ADD VALUE` はトランザクション内で実行できないため、
--       Prisma migrate ランナーは enum 追加だけを含む migration を非トランザクションで実行する。
--       適用後の削除・rename は不可能。

-- AlterEnum
ALTER TYPE "Feature" ADD VALUE 'DESCRIPTION_SYNC';
