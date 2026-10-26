-- Schema from velobase/velobase @velobase/billing v0.1.1 (Apache-2.0),
-- including 0002_allocation_order. Accounting writes remain owned by the package.
-- Kept in a separate schema so Prisma db push cannot remove ledger tables.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('harness:local-credit-ledger-schema', 0));
CREATE SCHEMA IF NOT EXISTS velobase_billing;
SET LOCAL search_path TO velobase_billing;

CREATE TABLE IF NOT EXISTS billing_grants (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(255) NOT NULL,
  customer_id VARCHAR(255) NOT NULL,
  wallet VARCHAR(255) NOT NULL,
  source VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  total_amount BIGINT NOT NULL CHECK (total_amount > 0),
  used_amount BIGINT NOT NULL DEFAULT 0 CHECK (used_amount >= 0),
  reserved_amount BIGINT NOT NULL DEFAULT 0 CHECK (reserved_amount >= 0),
  valid_from TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT billing_grants_balance_check
    CHECK (used_amount + reserved_amount <= total_amount),
  CONSTRAINT billing_grants_validity_check
    CHECK (expires_at IS NULL OR valid_from IS NULL OR expires_at > valid_from),
  UNIQUE (tenant_id, project_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS billing_grants_wallet_balance_idx
  ON billing_grants (tenant_id, project_id, customer_id, wallet, expires_at, created_at);

CREATE TABLE IF NOT EXISTS billing_reservations (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(255) NOT NULL,
  customer_id VARCHAR(255) NOT NULL,
  wallet VARCHAR(255) NOT NULL,
  transaction_id VARCHAR(255) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('RESERVED', 'SETTLED', 'RELEASED')),
  reserved_amount BIGINT NOT NULL CHECK (reserved_amount > 0),
  settled_amount BIGINT NOT NULL DEFAULT 0 CHECK (settled_amount >= 0),
  released_amount BIGINT NOT NULL DEFAULT 0 CHECK (released_amount >= 0),
  automatic_action VARCHAR(16) CHECK (automatic_action IN ('SETTLE', 'RELEASE')),
  automatic_action_after_seconds INTEGER,
  automatic_action_at TIMESTAMPTZ,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, project_id, transaction_id),
  CONSTRAINT billing_reservations_settlement_check
    CHECK (settled_amount + released_amount <= reserved_amount),
  CONSTRAINT billing_reservations_automatic_schedule_check
    CHECK (
      (automatic_action IS NULL AND automatic_action_after_seconds IS NULL AND automatic_action_at IS NULL)
      OR
      (automatic_action IS NOT NULL AND automatic_action_after_seconds IS NOT NULL AND automatic_action_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS billing_reservations_due_idx
  ON billing_reservations (automatic_action_at)
  WHERE status = 'RESERVED' AND automatic_action_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_allocations (
  id UUID PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES billing_reservations (id) ON DELETE RESTRICT,
  allocation_order INTEGER NOT NULL CHECK (allocation_order >= 0),
  UNIQUE (reservation_id, allocation_order),
  grant_id UUID NOT NULL REFERENCES billing_grants (id) ON DELETE RESTRICT,
  reserved_amount BIGINT NOT NULL CHECK (reserved_amount > 0),
  settled_amount BIGINT NOT NULL DEFAULT 0 CHECK (settled_amount >= 0),
  released_amount BIGINT NOT NULL DEFAULT 0 CHECK (released_amount >= 0),
  status VARCHAR(16) NOT NULL CHECK (status IN ('RESERVED', 'SETTLED', 'RELEASED')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (reservation_id, grant_id),
  CONSTRAINT billing_allocations_settlement_check
    CHECK (settled_amount + released_amount <= reserved_amount)
);

CREATE INDEX IF NOT EXISTS billing_allocations_grant_idx ON billing_allocations (grant_id);

CREATE TABLE IF NOT EXISTS billing_ledger_entries (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(255) NOT NULL,
  customer_id VARCHAR(255) NOT NULL,
  wallet VARCHAR(255) NOT NULL,
  source VARCHAR(255) NOT NULL,
  grant_id UUID NOT NULL REFERENCES billing_grants (id) ON DELETE RESTRICT,
  reservation_id UUID REFERENCES billing_reservations (id) ON DELETE RESTRICT,
  transaction_id VARCHAR(255) NOT NULL,
  operation VARCHAR(16) NOT NULL CHECK (operation IN ('GRANT', 'RESERVE', 'SETTLE', 'RELEASE')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS billing_ledger_scope_created_idx
  ON billing_ledger_entries (tenant_id, project_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS billing_ledger_customer_created_idx
  ON billing_ledger_entries (tenant_id, project_id, customer_id, wallet, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS billing_ledger_transaction_idx
  ON billing_ledger_entries (tenant_id, project_id, transaction_id, created_at, id);

COMMENT ON TABLE billing_ledger_entries IS
  'Append-only usage credit history. Corrections must be represented by new entries.';

COMMIT;
