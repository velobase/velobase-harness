import { Pool } from "pg";
import { env } from "@/env";
import { createLogger } from "@/lib/logger";

const logger = createLogger("billing-database");
const globalBilling = globalThis as unknown as { billingPool?: Pool };

/** The engine requires pg transactions; its tables live outside Prisma's schema. */
export function getBillingPool(): Pool {
  if (!globalBilling.billingPool) {
    const connectionString = new URL(env.DATABASE_URL);
    // pg gives URL options precedence over Pool options. Put the ledger schema
    // last in the URL itself while preserving other PostgreSQL startup options.
    connectionString.searchParams.set(
      "options",
      [
        connectionString.searchParams.get("options"),
        "-c search_path=velobase_billing",
      ]
        .filter(Boolean)
        .join(" "),
    );
    globalBilling.billingPool = new Pool({
      connectionString: connectionString.toString(),
      max: 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      allowExitOnIdle: true,
    });
    globalBilling.billingPool.on("error", (err) => {
      logger.error({ err }, "Billing database connection failed");
    });
  }
  return globalBilling.billingPool;
}
