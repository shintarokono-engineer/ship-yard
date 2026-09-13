-- ADR-015: 無料公開アイデア検証ツール `/check` の 2 テーブルを追加する。
--
-- `PublicIdeaCheck` は**テナントに属さない**(ログイン不要で実行されるため、実行時点で
-- テナントが存在しない)。`TENANT_SCOPED_MODELS` は許可リスト方式なので、登録しないことで
-- tenantId 自動注入の対象外になる。ADR-002 を破っているのではなく、テナントを持たないモデル。
--
-- `PublicCheckUsage` は日次実行回数のカウンタで、費用の天井の主防御。`PublicIdeaCheck` の
-- 件数で数えると失敗した実行がカウントされず、失敗を繰り返せば天井が破れるため別に持つ。
--
-- 注意: `--create-only` で生成し、適用前に `DROP INDEX "ProjectDocument_embedding_hnsw_idx"`
-- を除去した(ADR-005 の RAG 用 HNSW インデックス。Prisma が認識できず毎回ドリフト扱いで
-- DROP を提案してくるが、消すとベクトル検索が全件走査になる。implementation-rules.md 参照)。

-- CreateTable
CREATE TABLE "PublicIdeaCheck" (
    "id" TEXT NOT NULL,
    "ideaText" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "suggestions" JSONB NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "costJpy" DECIMAL(10,4) NOT NULL,
    "sharedAt" TIMESTAMP(3),
    "claimedByTenantId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicIdeaCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicCheckUsage" (
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PublicCheckUsage_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE INDEX "PublicIdeaCheck_createdAt_idx" ON "PublicIdeaCheck"("createdAt");

-- CreateIndex
CREATE INDEX "PublicIdeaCheck_ipHash_createdAt_idx" ON "PublicIdeaCheck"("ipHash", "createdAt");
