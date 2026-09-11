-- Additive only. Existing cycles are NOT backfilled as completed deliveries.
CREATE TABLE IF NOT EXISTS "membership_subscription_deliveries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "cycle_id" TEXT NOT NULL,
  "plan" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "membership_subscription_deliveries_subscription_id_idx" ON "membership_subscription_deliveries"("subscription_id");
CREATE INDEX IF NOT EXISTS "membership_subscription_deliveries_cycle_id_idx" ON "membership_subscription_deliveries"("cycle_id");
CREATE INDEX IF NOT EXISTS "membership_subscription_deliveries_user_id_idx" ON "membership_subscription_deliveries"("user_id");
CREATE INDEX IF NOT EXISTS "membership_subscription_deliveries_completed_at_idx" ON "membership_subscription_deliveries"("completed_at");
CREATE TABLE IF NOT EXISTS "membership_subscription_delivery_effects" (
  "delivery_id" TEXT NOT NULL REFERENCES "membership_subscription_deliveries"("id") ON DELETE RESTRICT,
  "effect_key" TEXT NOT NULL,
  "result" JSONB,
  "completed_at" TIMESTAMP(3),
  PRIMARY KEY ("delivery_id", "effect_key")
);
