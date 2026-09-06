import { z } from "zod";

/** Existing Web /api/health and optional Hono /health wire format. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export function createHealthResponse(now = new Date()): HealthResponse {
  return { status: "ok", timestamp: now.toISOString() };
}
