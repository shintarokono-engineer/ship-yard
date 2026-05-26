-- Feature enum に IDEA_VALIDATION を追加(Day 44、ADR-013 改訂版「2 モード化」)。
-- AIUsage の集計軸として「アイデア検証(発案段階の Problem-Solution Fit 検証)」 を
-- PRODUCT_DIAGNOSIS と区別するための新しい値。
--
-- 注意: PostgreSQL の `ALTER TYPE ... ADD VALUE` は **トランザクション内で実行できない** ため、
--       Prisma migrate ランナーは enum 追加だけを含む migration を非トランザクションで実行する。
--       Day 14 REFINE_DOC / Day 43 PRODUCT_DIAGNOSIS と同パターン。

-- AlterEnum
ALTER TYPE "Feature" ADD VALUE 'IDEA_VALIDATION';
