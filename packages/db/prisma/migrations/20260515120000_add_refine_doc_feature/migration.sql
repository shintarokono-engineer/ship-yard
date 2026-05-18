-- Feature enum に REFINE_DOC を追加(Day 14、ADR-005)。
-- AIUsage の集計軸として「既存ドキュメントの文章推敲」を区別するための新しい値。
--
-- 注意: PostgreSQL の `ALTER TYPE ... ADD VALUE` は **トランザクション内で実行できない** ため、
--       Prisma migrate ランナーは enum 追加だけを含む migration を非トランザクションで実行する。
--       既存値の削除や rename は不可能(下位互換のため)。
--
-- 作成経緯: ローカル環境で `prisma migrate dev --create-only` が advisory lock 残存で
--          ハングしたため、本ファイルは手作業で作成。DB 適用後
--          `prisma migrate resolve --applied 20260515120000_add_refine_doc_feature` で
--          `_prisma_migrations` に記録した。CI / 他環境では `prisma migrate deploy` で通常通り適用される。

-- AlterEnum
ALTER TYPE "Feature" ADD VALUE 'REFINE_DOC';
