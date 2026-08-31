-- ADR-016: 取り残しジョブのクレジット予約を解放できるよう、AiJob に予約行 ID を持たせる。
--
-- 予約(AIUsage の行)は AI 呼び出しの前に INSERT され、成功で確定・失敗で削除されるが、
-- プロセスが落ちるとどちらも走らず予約が残り続ける。同期実行では起こり得なかったが、
-- 実行を切り離したことで発生しうるようになった。取り残し判定時にこの ID で解放する。
--
-- 注意: `migrate dev --create-only` で生成し、適用前に
-- `DROP INDEX "ProjectDocument_embedding_hnsw_idx"`(ADR-005 の RAG インデックス)を除去した。
-- Prisma は管理外の HNSW インデックスを毎回ドリフト扱いにする(implementation-rules.md 参照)。

-- AlterTable
ALTER TABLE "AiJob" ADD COLUMN     "reservationId" TEXT;
