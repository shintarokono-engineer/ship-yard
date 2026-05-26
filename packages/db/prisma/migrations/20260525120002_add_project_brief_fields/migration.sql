-- Project model に詳細情報フィールド 4 つを追加(Day 44、ADR-013 改訂版「2 モード化」)。
-- アイデア検証(IdeaValidation)とプロダクト診断(ServiceScore)の両機能の入力源として、
-- 診断ボタン押下時にフォーム入力させるのではなく、プロジェクト編集画面の「詳細情報」 タブで
-- 一度入力 → AI 機能側は保存済データを読むだけ、という UX 設計。全フィールド optional で
-- 既存レコードへの影響なし。
--
-- 作成経緯: 同上(別セッションの未コミット migration 競合を避けるため手作業作成)。

-- AlterTable
ALTER TABLE "Project"
  ADD COLUMN "targetUsers" TEXT,
  ADD COLUMN "problemStatement" TEXT,
  ADD COLUMN "proposedFeatures" TEXT,
  ADD COLUMN "pricingModel" TEXT;
