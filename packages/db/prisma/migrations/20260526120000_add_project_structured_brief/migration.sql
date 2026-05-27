-- Project に構造化セレクト 5 フィールドを追加(Day 46.5、ADR-013 改訂版「構造化入力」)。
--
-- Day 44 の自由記述 4 フィールド(targetUsers / problemStatement / proposedFeatures /
-- pricingModel)はそのまま残し、本 migration で構造化セレクト 5 フィールドを追加する。
-- これにより AI 側は「構造化属性 + 自由補足」 の両方を受け取れるようになる。
--
-- 構造化フィールドの値はすべて enum 文字列(セレクトの value)を String / Json で保存。
-- 後方互換のため Prisma の Enum 化はせず TEXT で柔軟性確保(将来 v2 で enum 化検討)。
--
-- 作成経緯: 別セッションの未コミット migration 競合を避けるため手作業作成。

-- AlterTable
ALTER TABLE "Project"
  ADD COLUMN "targetUserAttrs" JSONB,
  ADD COLUMN "problemCategory" TEXT,
  ADD COLUMN "coreFeatures" JSONB,
  ADD COLUMN "pricingType" TEXT,
  ADD COLUMN "pricingRange" TEXT;
