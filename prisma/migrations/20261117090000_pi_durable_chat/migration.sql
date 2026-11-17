-- Pi Durable PostgreSQL storage schema for durable agent conversations, tasks, submissions, and documents.
-- Kept in a separate schema so Prisma db push cannot remove Pi Durable tables.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('harness:pi-durable-schema', 0));
CREATE SCHEMA IF NOT EXISTS "pi_durable";

CREATE TABLE IF NOT EXISTS "pi_durable"."durable_schema" (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  version INTEGER NOT NULL CHECK (version >= 0)
);

INSERT INTO "pi_durable"."durable_schema" (singleton, version)
VALUES (1, 2)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS "pi_durable"."durable_metadata" (
  session_id TEXT PRIMARY KEY,
  next_id BIGINT NOT NULL,
  next_seq BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS "pi_durable"."record_ids" (
  session_id TEXT NOT NULL,
  id BIGINT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('conversation', 'entry', 'task', 'submission', 'document')),
  PRIMARY KEY (session_id, id)
);

CREATE TABLE IF NOT EXISTS "pi_durable"."conversations" (
  session_id TEXT NOT NULL,
  id BIGINT NOT NULL,
  owner_conversation_id BIGINT,
  owner_task_id BIGINT,
  record TEXT NOT NULL,
  PRIMARY KEY (session_id, id)
);

CREATE INDEX IF NOT EXISTS "conversations_by_owner_conversation"
  ON "pi_durable"."conversations" (session_id, owner_conversation_id, id);

CREATE INDEX IF NOT EXISTS "conversations_by_owner_task"
  ON "pi_durable"."conversations" (session_id, owner_task_id, id);

CREATE TABLE IF NOT EXISTS "pi_durable"."entries" (
  session_id TEXT NOT NULL,
  id BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  head BIGINT,
  commit_seq BIGINT NOT NULL,
  record TEXT NOT NULL,
  PRIMARY KEY (session_id, id)
);

CREATE INDEX IF NOT EXISTS "entries_by_conversation"
  ON "pi_durable"."entries" (session_id, conversation_id, id DESC);

CREATE INDEX IF NOT EXISTS "entry_heads_by_conversation"
  ON "pi_durable"."entries" (session_id, conversation_id, id DESC)
  WHERE head IS NOT NULL;

CREATE TABLE IF NOT EXISTS "pi_durable"."tasks" (
  session_id TEXT NOT NULL,
  id BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'waiting', 'sleeping', 'completing', 'terminal')),
  abort_requested INTEGER NOT NULL CHECK (abort_requested IN (0, 1)),
  background INTEGER NOT NULL CHECK (background IN (0, 1)),
  record TEXT NOT NULL,
  PRIMARY KEY (session_id, id)
);

CREATE INDEX IF NOT EXISTS "tasks_by_status"
  ON "pi_durable"."tasks" (session_id, status, id);

CREATE INDEX IF NOT EXISTS "tasks_by_conversation"
  ON "pi_durable"."tasks" (session_id, conversation_id, id);

CREATE INDEX IF NOT EXISTS "tasks_by_kind"
  ON "pi_durable"."tasks" (session_id, kind, id);

CREATE INDEX IF NOT EXISTS "tasks_by_abort_requested"
  ON "pi_durable"."tasks" (session_id, abort_requested, id);

CREATE INDEX IF NOT EXISTS "tasks_by_background"
  ON "pi_durable"."tasks" (session_id, background, id);

CREATE TABLE IF NOT EXISTS "pi_durable"."submissions" (
  session_id TEXT NOT NULL,
  id BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  request_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'placed', 'done', 'unanswered')),
  record TEXT NOT NULL,
  PRIMARY KEY (session_id, id)
);

CREATE INDEX IF NOT EXISTS "submissions_by_request"
  ON "pi_durable"."submissions" (session_id, conversation_id, request_id);

CREATE INDEX IF NOT EXISTS "submissions_by_conversation"
  ON "pi_durable"."submissions" (session_id, conversation_id, id);

CREATE INDEX IF NOT EXISTS "submissions_by_status"
  ON "pi_durable"."submissions" (session_id, status, id);

CREATE TABLE IF NOT EXISTS "pi_durable"."documents" (
  session_id TEXT NOT NULL,
  id BIGINT NOT NULL,
  kind TEXT NOT NULL,
  family INTEGER NOT NULL CHECK (family IN (0, 1)),
  key_value TEXT NOT NULL,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('session', 'conversation', 'task')),
  owner_id BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  retired_at BIGINT,
  record TEXT NOT NULL,
  PRIMARY KEY (session_id, id)
);

CREATE INDEX IF NOT EXISTS "documents_by_address"
  ON "pi_durable"."documents" (session_id, kind, scope_kind, owner_id, family, key_value, created_at DESC, retired_at);

CREATE INDEX IF NOT EXISTS "documents_by_scope"
  ON "pi_durable"."documents" (session_id, scope_kind, owner_id, id);

CREATE INDEX IF NOT EXISTS "documents_by_scope_kind"
  ON "pi_durable"."documents" (session_id, scope_kind, owner_id, kind, id);

CREATE TABLE IF NOT EXISTS "pi_durable"."document_revisions" (
  session_id TEXT NOT NULL,
  document_id BIGINT NOT NULL,
  seq BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('base', 'delta')),
  version BIGINT NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (session_id, document_id, seq)
);

CREATE INDEX IF NOT EXISTS "document_revisions_by_kind"
  ON "pi_durable"."document_revisions" (session_id, document_id, kind, seq DESC);

COMMIT;
