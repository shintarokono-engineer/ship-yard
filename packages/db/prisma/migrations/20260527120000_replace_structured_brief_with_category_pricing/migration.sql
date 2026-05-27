-- Day 46.5 案 A(ADR-013 改訂版「構造化入力 v2」)。
--
-- 前 migration `20260526120000_add_project_structured_brief` で追加した 5 構造化列
-- (targetUserAttrs / problemCategory / coreFeatures / pricingType / pricingRange)が
-- B2B SaaS 前提の語彙で全プロダクトに対応できない設計問題を抱えていたため、案 A で:
--   - 5 列を drop(プロダクト多様性に対応できないため、textarea + プレースホルダー強化に逃がす)
--   - 全プロダクト適用可能な「ドメイン分類(categoryDomain)」 + 「課金 + 価格帯統合(pricingTier)」 の
--     2 軸のみを追加(矛盾組合せが起きえない設計)
--
-- 既存データ: Day 46.5 が未公開 + ユーザーが未利用のため、5 列の値消失は許容。
-- staging / prod に Day 46.5 が未到達なので破壊的変更でも安全(ロールバック計画も不要)。

ALTER TABLE "Project"
  DROP COLUMN "targetUserAttrs",
  DROP COLUMN "problemCategory",
  DROP COLUMN "coreFeatures",
  DROP COLUMN "pricingType",
  DROP COLUMN "pricingRange",
  ADD COLUMN "categoryDomain" TEXT,
  ADD COLUMN "pricingTier" TEXT;
