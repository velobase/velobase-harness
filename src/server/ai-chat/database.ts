import { Pool } from "pg";
import { env } from "@/env";
import { createLogger } from "@/lib/logger";

const logger = createLogger("ai-chat-database");
const globalChat = globalThis as unknown as { chatPool?: Pool };

/** Shared PostgreSQL pool for Pi Durable storage tables in the pi_durable schema. */
export function getChatPool(): Pool {
  if (!globalChat.chatPool) {
    globalChat.chatPool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      allowExitOnIdle: true,
    });
    globalChat.chatPool.on("error", (err) => {
      logger.error({ err }, "Pi Durable chat database connection failed");
    });
  }
  return globalChat.chatPool;
}
