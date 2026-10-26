# Database Integration

Database integration covers Prisma, PostgreSQL, Redis, migrations, and seed data.

## Use

- Use `db` from `@/server/db`; never create a new PrismaClient.
- Use `redis` from `@/server/redis`; never create ad hoc Redis connections.
- Product entities belong in `prisma/schema.prisma` and product module services.

## Configuration

Common environment variables:

- `DATABASE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- Redis authentication or TLS variables when required by the provider.

Update `.env.example` and `src/env.js` when configuration changes.

## Migrations

- Local experimentation may use `npx prisma db push`.
- Committed deployable changes require `prisma/migrations/*`.
- Production deploys should use `prisma migrate deploy`.
- Required fields need a safe migration plan for existing data.
- Seed scripts should be idempotent.

## Credit ledger schema

The `velobase_billing` schema is owned by the pinned `@velobase/billing` engine and installed by the committed Prisma SQL migration. Its tables are intentionally outside `schema.prisma` so local `db:push` does not manage or remove them. The engine uses a shared, bounded `pg` pool configured by `src/server/billing/database.ts`; product code still uses `db` for application data. After a local `db:push`, run `pnpm billing:migrate` to install this schema without applying the full application migration history.

## AI Rules

- Do not modify framework-reserved tables unless the user explicitly requests it.
- Use `cuid()`, ownership fields, timestamps, enums for finite states, and indexes.
- Keep business rules in services, not Prisma model comments or router bodies.
