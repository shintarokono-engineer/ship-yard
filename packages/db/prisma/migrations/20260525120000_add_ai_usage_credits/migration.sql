-- ADR-012(プラン構造の全面見直し)v1.0.1: AI クレジット制本実装。
-- AIUsage に credits 列を追加し、モデル別重み付け(Haiku=1, Sonnet=3, OTHER=0)
-- で月次プラン上限(Pro 300、Team 800/seat)を判定する。

-- AlterTable
ALTER TABLE "AIUsage" ADD COLUMN "credits" INTEGER NOT NULL DEFAULT 0;
