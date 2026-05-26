-- Feature enum に PRODUCT_DIAGNOSIS を追加(Day 43、ADR-013)。
-- AIUsage の集計軸として「プロダクト診断(競合調査 + サービスレベルスコア化)」 を
-- 区別するための新しい値。Sonnet 4 + Web Search Tool + Tool Use(submit_service_score)
-- で 5 軸 × 各 20 点の構造化スコア + 改善提案を生成し、`ServiceScore` テーブルに保存する。
--
-- 注意: PostgreSQL の `ALTER TYPE ... ADD VALUE` は **トランザクション内で実行できない** ため、
--       Prisma migrate ランナーは enum 追加だけを含む migration を非トランザクションで実行する。
--       既存値 `COMPETITOR_RESEARCH` は ADR-013 で deprecated 化したが、`DROP VALUE` 非サポート
--       のため schema 上は残置(コメントで明示)。
--
-- 作成経緯: 別セッションが共有ローカル DB に未コミット migration を持つ可能性があるため、
--          `prisma migrate dev` を使わず手作業で SQL を作成。DB 適用は Day 44 で
--          他セッションと履歴を揃えてから(必要なら `prisma migrate resolve --applied` を使用)。

-- AlterEnum
ALTER TYPE "Feature" ADD VALUE 'PRODUCT_DIAGNOSIS';
