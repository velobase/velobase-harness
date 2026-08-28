#!/bin/sh
set -e

# --- Database migrations ---
# Set SKIP_MIGRATION=true to skip (e.g. worker-only replicas where another pod handles migrations)
if [ "$SKIP_MIGRATION" = "true" ]; then
  echo "[entrypoint] SKIP_MIGRATION=true, skipping database migrations"
else
  echo "[entrypoint] Running prisma migrate deploy..."
  if npx prisma migrate deploy; then
    echo "[entrypoint] Migrations complete"
  else
    if [ "$MIGRATION_OPTIONAL" = "true" ]; then
      echo "[entrypoint] WARNING: Migration failed but MIGRATION_OPTIONAL=true, continuing..."
    else
      echo "[entrypoint] ERROR: Migration failed, exiting"
      exit 1
    fi
  fi
fi

# --- Database seed ---
# Set SKIP_SEED=true to skip (e.g. replicas where another pod handles seed data)
if [ "$SKIP_SEED" = "true" ]; then
  echo "[entrypoint] SKIP_SEED=true, skipping database seed"
else
  echo "[entrypoint] Running database seed..."
  if npx tsx prisma/seed.ts; then
    echo "[entrypoint] Seed complete"
  else
    if [ "$SEED_OPTIONAL" = "true" ]; then
      echo "[entrypoint] WARNING: Seed failed but SEED_OPTIONAL=true, continuing..."
    else
      echo "[entrypoint] ERROR: Seed failed, exiting"
      exit 1
    fi
  fi
fi

# --- Resource readiness summary ---
echo "[entrypoint] SERVICE_MODE=${SERVICE_MODE:-web,worker}"
[ -n "$DATABASE_URL" ]    && echo "[entrypoint] DATABASE_URL=set"    || echo "[entrypoint] DATABASE_URL=NOT SET"
[ -n "$REDIS_URL" ]       && echo "[entrypoint] REDIS_URL=set"       || echo "[entrypoint] REDIS_HOST=${REDIS_HOST:-NOT SET}"
[ -n "$STORAGE_BUCKET" ]  && echo "[entrypoint] STORAGE_BUCKET=${STORAGE_BUCKET}" || echo "[entrypoint] STORAGE_BUCKET=NOT SET"
[ -n "${AUTH_SECRET:-${NEXTAUTH_SECRET:-}}" ] && echo "[entrypoint] AUTH_SECRET=set" || echo "[entrypoint] AUTH_SECRET=NOT SET"
echo "[entrypoint] APP_URL=${APP_URL:-${AUTH_URL:-${NEXTAUTH_URL:-NOT SET}}}"

# --- Start services ---
if [ "$SERVICE_MODE" = 'web' ]; then
  exec node server.js
elif [ "$SERVICE_MODE" = 'api' ]; then
  exec node --import tsx src/api/index.ts
elif [ "$SERVICE_MODE" = 'worker' ]; then
  exec node --import tsx src/workers/index.ts
else
  exec node --import tsx src/server/standalone.ts
fi
