-- IdeaValidation テーブル追加(Day 44、ADR-013 改訂版「2 モード化」)。
-- Project.status = IDEA のときに実行する Lean Startup の Problem-Solution Fit 検証機能。
-- ServiceScore と並ぶ独立機能(機能完成度・リリース準備度の代わりに 問題明確性・市場性 を評価)。
-- 1 プロジェクトに複数件の検証履歴を持ち、`createdAt` で時系列比較できる(履歴比較が機能の本質、
-- ServiceScore と同パターン)。
--
-- breakdown / suggestions / competitorRefs は Json snapshot 保存
-- (参照先 URL が後で変わっても履歴的事実を保つ、RagQaMessage.references パターン踏襲)。
-- recommendation は 'GO' | 'PIVOT' | 'NO_GO' を TEXT で保存(柔軟性重視、enum 化は将来検討)。
--
-- 作成経緯: 同上(別セッションの未コミット migration 競合を避けるため手作業作成)。

-- CreateTable
CREATE TABLE "IdeaValidation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "recommendation" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "suggestions" JSONB NOT NULL,
    "competitorRefs" JSONB NOT NULL,
    "webSearchUsed" BOOLEAN NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaValidation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdeaValidation_tenantId_idx" ON "IdeaValidation"("tenantId");

-- CreateIndex
-- 履歴比較画面で「特定プロジェクトの最新 N 件を新しい順」 を高速取得するため(ServiceScore と同パターン)
CREATE INDEX "IdeaValidation_projectId_createdAt_idx" ON "IdeaValidation"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "IdeaValidation" ADD CONSTRAINT "IdeaValidation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaValidation" ADD CONSTRAINT "IdeaValidation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaValidation" ADD CONSTRAINT "IdeaValidation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
