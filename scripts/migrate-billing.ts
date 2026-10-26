import "dotenv/config";
import { readFile } from "node:fs/promises";
import { getBillingPool } from "../src/server/billing/database";

// Local db:push does not manage the engine's separate schema. Deployments use Prisma migrations.
const pool = getBillingPool();
try {
  const sql = await readFile(
    new URL(
      "../prisma/migrations/20261026090000_local_credit_ledger/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await pool.query(sql);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
