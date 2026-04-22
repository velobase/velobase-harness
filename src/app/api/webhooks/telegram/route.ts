/**
 * Telegram Bot Webhook endpoint.
 *
 * Receives updates from Telegram (messages, pre_checkout_query, successful_payment)
 * and delegates to the bot handler.
 *
 * Security: validates the X-Telegram-Bot-Api-Secret-Token header against
 * TELEGRAM_WEBHOOK_SECRET to ensure requests come from Telegram.
 */

import { env } from "@/env";
import { MODULES } from "@/config/modules";
import { handleTelegramUpdate } from "@/server/telegram/bot-handler";
import type { TelegramUpdate } from "@/server/telegram/api";
import { logger as rootLogger } from "@/server/shared/telemetry/logger";

const logger = rootLogger.child({ module: "telegram-webhook-route" });

export async function POST(req: Request) {
  if (!MODULES.integrations.messaging.telegram.enabled) {
    return new Response(null, { status: 404 });
  }

  logger.info("Telegram webhook received");

  // Verify webhook secret
  const secretToken = req.headers.get("x-telegram-bot-api-secret-token");
  if (env.TELEGRAM_WEBHOOK_SECRET && secretToken !== env.TELEGRAM_WEBHOOK_SECRET) {
    logger.warn({ hasSecret: !!secretToken }, "Telegram webhook unauthorized: secret mismatch");
    return new Response("Unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    logger.warn("Telegram webhook: failed to parse JSON body");
    return new Response("Bad Request", { status: 400 });
  }

  logger.info(
    {
      updateId: update.update_id,
      hasMessage: !!update.message,
      hasPreCheckout: !!update.pre_checkout_query,
      messageText: update.message?.text?.slice(0, 50),
      fromId: update.message?.from?.id ?? update.pre_checkout_query?.from?.id,
      hasSuccessfulPayment: !!update.message?.successful_payment,
    },
    "Telegram webhook update parsed",
  );

  // Process synchronously — Telegram expects response within 10s for pre_checkout_query
  try {
    await handleTelegramUpdate(update);
    logger.info({ updateId: update.update_id }, "Telegram webhook update processed successfully");
  } catch (err) {
    logger.error({ err, updateId: update.update_id }, "Telegram webhook handler error");
    // Still return 200 to prevent Telegram from retrying
  }

  return Response.json({ ok: true });
}
