-- ServiceScore テーブル追加(Day 43、ADR-013)。
-- PRODUCT_DIAGNOSIS の結果(総合スコア + 5 軸ブレークダウン + 改善提案 + 競合参照)を保存する
-- 専用テーブル。1 プロジェクトに複数件の診断履歴を持ち、`createdAt` で時系列比較できる
-- (履歴比較が機能の本質、LandingPage のような 1 プロジェクト 1 行ではない)。
--
-- 競合データ(`competitorRefs`)と breakdown / suggestions は Json で snapshot 保存し、
-- 参照先 URL が後で変わっても履歴的事実を保つ(RagQaMessage.references パターン踏襲)。
--
-- 作成経緯: 同上(別セッションの未コミット migration 競合を避けるため手作業作成)。

-- CreateTable
CREATE TABLE "ServiceScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "suggestions" JSONB NOT NULL,
    "competitorRefs" JSONB NOT NULL,
    "webSearchUsed" BOOLEAN NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceScore_tenantId_idx" ON "ServiceScore"("tenantId");

-- CreateIndex
-- 履歴比較画面で「特定プロジェクトの最新 N 件を新しい順」 を高速取得するため
CREATE INDEX "ServiceScore_projectId_createdAt_idx" ON "ServiceScore"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "ServiceScore" ADD CONSTRAINT "ServiceScore_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceScore" ADD CONSTRAINT "ServiceScore_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceScore" ADD CONSTRAINT "ServiceScore_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
