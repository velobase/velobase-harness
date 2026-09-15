CREATE TABLE "feature_settings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL,
  "updated_by" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "service_connections" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "config" JSONB NOT NULL,
  "secret" TEXT,
  "verified_at" TIMESTAMP(3),
  "updated_by" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "support_sync_cursors" ADD COLUMN "uid_validity" TEXT;
CREATE TYPE "SupportReplyStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'UNKNOWN', 'CANCELED');
CREATE TABLE "support_replies" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticket_id" TEXT NOT NULL REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "actor" "SupportActorType" NOT NULL,
  "actor_id" TEXT,
  "body" TEXT NOT NULL,
  "status" "SupportReplyStatus" NOT NULL DEFAULT 'PENDING',
  "message_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "support_replies_status_created_at_idx" ON "support_replies"("status", "created_at");
CREATE INDEX "support_replies_ticket_id_created_at_idx" ON "support_replies"("ticket_id", "created_at");

ALTER TABLE "support_sync_cursors" ADD COLUMN "lease_token" TEXT, ADD COLUMN "lease_expires_at" TIMESTAMP(3);

ALTER TYPE "PromoCodeStatus" ADD VALUE 'DRAFT';
