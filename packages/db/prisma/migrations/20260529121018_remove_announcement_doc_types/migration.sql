-- §9.12.3 ADR-014 ANNOUNCEMENT_GEN 追加に伴い、DRAFT_GEN を README 専用に縮小(2026-05-29)。
-- スコープ: `DocType` enum から `RELEASE_BLOG` / `TWEET` / `PRODUCT_HUNT` / `EMAIL` を削除。
-- 設計判断: 告知文(Twitter / Blog)の生成は ADR-014 の `Feature.ANNOUNCEMENT_GEN`(Sonnet 4 + Tool Use、Twitter + Blog
--   をマルチチャネルで一括生成)に統合。これに伴い `ProjectDocument` 経由で生成していた単一 DocType
--   (`RELEASE_BLOG` / `TWEET` / `PRODUCT_HUNT` / `EMAIL`)は重複機能となるため構造削除する。
--   §9.12.1 LP 削除と同じ「MVP リリース前(ユーザー 0)で物理削除可能」 という前提に立脚。
--
-- 注意:
--   - Prisma 6.x の `prisma migrate dev` は enum 値削除に対してインタラクティブ確認([y/N])を要求して
--     非対話環境で失敗するため、Day 49 / 49.5 同様、手作業で migration を書いている。
--   - HNSW インデックス DROP / 無関係な FK 付替は Prisma drift 検出で混入しがちだが、本 migration では除外している
--     (Day 14 / 15 / 26 / 27 / 49 / 49.5 で確立済みの運用ルール)。

-- ① 旧 4 値の `ProjectDocument` 行を物理削除(ローカル確認時点で 0 件、防御策として残す。本番でも公開前のため 0 件想定)。
--   テーブル全件スキャンになるが、本 migration 適用タイミング(MVP リリース前)では `ProjectDocument` は最小規模で
--   実害なし。リリース時の squash 統合(initial migration へ)で本行は消える想定なので index 追加は不要。
DELETE FROM "ProjectDocument" WHERE "type" IN ('RELEASE_BLOG', 'TWEET', 'PRODUCT_HUNT', 'EMAIL');

-- ② enum を作り直し:`DocType` を `DocType_old` にリネーム → 新 `DocType` を 2 値で作成 → 既存カラムを変換 → 旧 enum DROP。
--   既存行が全て新 enum で受けられる値(`README` / `OTHER`)しか持たないことを ① で保証している。
ALTER TYPE "DocType" RENAME TO "DocType_old";

CREATE TYPE "DocType" AS ENUM ('README', 'OTHER');

ALTER TABLE "ProjectDocument"
  ALTER COLUMN "type" TYPE "DocType" USING ("type"::text::"DocType");

DROP TYPE "DocType_old";
