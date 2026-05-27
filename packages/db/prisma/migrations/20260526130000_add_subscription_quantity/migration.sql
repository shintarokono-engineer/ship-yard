-- ADR-012 v1.0.1 リリース時タスク: Team プランの Stripe Subscription Quantity を内部 DB にミラー。
-- AI クレジット計算(Team 上限 = quantity × 800 cr)をこの列由来に切替えるため必須(第 2 層 Read 制限)。
-- 既存テナントは TenantMember.count を反映する初期値が無いので 1 で開始し、招待承諾・退会時の
-- Saga 同期(第 1 層)と Webhook 受信(applyStripeSubscription)で順次正規値に収束させる。

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
