-- §9.12.1 ドキュメント作成画面から LP を完全除外(2026-05-28、案 B 採用)。
-- スコープ: `DocType` enum から `LANDING_PAGE` 値を削除。
-- 設計判断: LP は ADR-009 で `LandingPage` 専用テーブル + ブロック生成に移行済 = 旧 `ProjectDocument.type=LANDING_PAGE` 行は
--   論理的にデッドストック。MVP リリース前(ユーザー 0)で物理削除可能なため、enum から構造的に除去する。
--   `Feature.COMPETITOR_RESEARCH` を残置にした判断と異なるのは、`ProjectDocument.type` を持つ既存行が 0 件(ローカル確認済)で
--   PostgreSQL の型変換が安全に通せるため。
--
-- 注意:
--   - Prisma 6.x の `prisma migrate dev` は enum 値削除に対してインタラクティブ確認([y/N])を要求して
--     非対話環境で失敗するため、Day 49 同様、手作業で migration を書いている。
--   - HNSW インデックス DROP / 無関係な FK 付替は Prisma drift 検出で混入しがちだが、本 migration では除外している
--     (Day 14 / 15 / 26 / 27 / 49 で確立済みの運用ルール)。

-- ① 旧 `LANDING_PAGE` 行を物理削除(ローカル確認時点で 0 件、防御策として残す。本番でも公開前のため 0 件想定)。
--   ON DELETE CASCADE が効いていない隣接行(AIUsage 等)も論理的には影響なし。
--   テーブル全件スキャンになるが、本 migration 適用タイミング(MVP リリース前)では `ProjectDocument` は最小規模で
--   実害なし。リリース時の squash 統合(initial migration へ)で本行は消える想定なので index 追加は不要。
DELETE FROM "ProjectDocument" WHERE "type" = 'LANDING_PAGE';

-- ② enum を作り直し:`DocType` を `DocType_old` にリネーム → 新 `DocType` を 6 値で作成 → 既存カラムを変換 → 旧 enum DROP。
--   既存行が全て新 enum で受けられる値しか持たないことを ① で保証している。
ALTER TYPE "DocType" RENAME TO "DocType_old";

CREATE TYPE "DocType" AS ENUM ('README', 'RELEASE_BLOG', 'TWEET', 'PRODUCT_HUNT', 'EMAIL', 'OTHER');

ALTER TABLE "ProjectDocument"
  ALTER COLUMN "type" TYPE "DocType" USING ("type"::text::"DocType");

DROP TYPE "DocType_old";
