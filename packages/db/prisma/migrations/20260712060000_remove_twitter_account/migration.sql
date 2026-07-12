-- ADR-014 (MVP) の Web Intent 方式移行に伴い、Twitter (X) OAuth 基盤を削除。
-- v1.x で API 版に戻す時に再作成する。

-- DropForeignKey
ALTER TABLE "TwitterAccount" DROP CONSTRAINT "TwitterAccount_tenantId_fkey";
ALTER TABLE "TwitterAccount" DROP CONSTRAINT "TwitterAccount_connectedById_fkey";

-- DropTable
DROP TABLE "TwitterAccount";
