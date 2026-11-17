import "dotenv/config";
import { readFile } from "node:fs/promises";
import { getChatPool } from "../src/server/ai-chat/database";

// Local db:push does not manage Pi Durable's separate schema. Deployments use Prisma migrations.
const pool = getChatPool();
try {
  const sql = await readFile(
    new URL(
      "../prisma/migrations/20261117090000_pi_durable_chat/migration.sql",
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
