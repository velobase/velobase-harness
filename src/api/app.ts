/**
 * Hono API Application Factory
 *
 * Creates and configures the Hono app with middleware and route groups.
 * Separated from the server entry so that the app can be tested or
 * composed into the standalone SERVICE_MODE process when API is enabled.
 */
import { traceApiRequest } from "@/server/telemetry/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { createLogger } from "@/lib/logger";
import { healthRoutes } from "./routes/health";
import { exampleWebhookRoutes } from "./routes/webhooks/example";

const log = createLogger("api");

export function createApiApp(): Hono {
  const app = new Hono();

  // --- Middleware -----------------------------------------------------------
  app.use("*", traceApiRequest);
  app.use("*", cors());
  app.use(
    "*",
    honoLogger((msg) => log.info(msg)),
  );

  // --- Global error handler -------------------------------------------------
  app.onError((err, c) => {
    log.error({ error: err }, "Unhandled API error");
    return c.json(
      { error: "Internal Server Error", message: err.message },
      500,
    );
  });

  // --- Routes ---------------------------------------------------------------
  app.route("/", healthRoutes);
  app.route("/webhooks", exampleWebhookRoutes);

  return app;
}
