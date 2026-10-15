CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUSPENDED', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "AgentOperationStatus" AS ENUM ('WAITING', 'PREPARED', 'RUNNING', 'SUCCEEDED', 'UNKNOWN');
CREATE TABLE "agent_runs" (
  "id" TEXT NOT NULL PRIMARY KEY, "executor" TEXT NOT NULL, "serial_key" TEXT NOT NULL,
  "actor_key" TEXT NOT NULL, "request_key" TEXT NOT NULL, "request_hash" TEXT NOT NULL,
  "input" JSONB NOT NULL, "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
  "epoch" INTEGER NOT NULL DEFAULT 0, "attempts" INTEGER NOT NULL DEFAULT 0,
  "steps" INTEGER NOT NULL DEFAULT 0, "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0, "usage_uncertain" BOOLEAN NOT NULL DEFAULT false,
  "lease_until" TIMESTAMP(3), "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "error_code" TEXT, "settled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "agent_runs_request_key_key" ON "agent_runs"("request_key");
CREATE UNIQUE INDEX "agent_runs_one_running_subject" ON "agent_runs"("serial_key") WHERE "status" = 'RUNNING';
CREATE INDEX "agent_runs_status_next_attempt_at_created_at_idx" ON "agent_runs"("status", "next_attempt_at", "created_at");
CREATE INDEX "agent_runs_status_lease_until_idx" ON "agent_runs"("status", "lease_until");
CREATE INDEX "agent_runs_serial_key_created_at_id_idx" ON "agent_runs"("serial_key", "created_at", "id");
CREATE INDEX "agent_runs_actor_key_created_at_idx" ON "agent_runs"("actor_key", "created_at");
CREATE TABLE "agent_attempts" (
  "id" TEXT NOT NULL PRIMARY KEY, "run_id" TEXT NOT NULL REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "epoch" INTEGER NOT NULL, "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3), "error_code" TEXT
);
CREATE UNIQUE INDEX "agent_attempts_run_id_epoch_key" ON "agent_attempts"("run_id", "epoch");
CREATE TABLE "agent_tool_operations" (
  "id" TEXT NOT NULL PRIMARY KEY, "run_id" TEXT NOT NULL REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tool_call_id" TEXT NOT NULL, "tool_name" TEXT NOT NULL, "execution_epoch" INTEGER NOT NULL DEFAULT 0, "input" JSONB NOT NULL, "output" JSONB,
  "status" "AgentOperationStatus" NOT NULL DEFAULT 'PREPARED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "agent_tool_operations_run_id_tool_call_id_key" ON "agent_tool_operations"("run_id", "tool_call_id");
CREATE INDEX "agent_tool_operations_run_id_status_idx" ON "agent_tool_operations"("run_id", "status");

ALTER TABLE "conversations" ADD COLUMN "guest_owner_hash" TEXT;
