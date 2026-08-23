-- CreateEnum
CREATE TYPE "TrialNotificationKind" AS ENUM ('THREE_DAYS', 'LAST_DAY');

-- CreateTable
CREATE TABLE "TrialNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "TrialNotificationKind" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrialNotification_tenantId_kind_key" ON "TrialNotification"("tenantId", "kind");

-- AddForeignKey
ALTER TABLE "TrialNotification" ADD CONSTRAINT "TrialNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
