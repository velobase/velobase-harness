import { Hono } from "hono";
import { createHealthResponse } from "@velobase/contracts";
import { redis } from "@/server/redis";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
  return c.json(createHealthResponse());
});

healthRoutes.get("/ready", async (c) => {
  try {
    const ping = await redis.ping();
    if (ping !== "PONG") throw new Error("Redis not responding");
    return c.json({ status: "ready", timestamp: new Date().toISOString() });
  } catch (err) {
    return c.json(
      {
        status: "not_ready",
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Unknown error",
      },
      503,
    );
  }
});
