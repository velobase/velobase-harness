/**
 * Script to set up Telegram Bot webhook.
 *
 * Run this once after deployment to register the webhook URL with Telegram:
 *
 *   npx tsx src/server/telegram/setup-webhook.ts
 *
 * Or pass a custom URL:
 *
 *   WEBHOOK_URL=https://your-domain.com/api/webhooks/telegram npx tsx src/server/telegram/setup-webhook.ts
 */

/* eslint-disable no-console */

interface TelegramResponse {
  ok: boolean;
  description?: string;
  result?: {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
  };
}

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const appUrl =
    process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL;

  if (!botToken) {
    console.error("Error: TELEGRAM_BOT_TOKEN is not set");
    process.exit(1);
  }

  const webhookUrl =
    process.env.WEBHOOK_URL ?? `${appUrl}/api/webhooks/telegram`;

  if (!webhookUrl || webhookUrl.includes("undefined")) {
    console.error(
      "Error: Cannot determine webhook URL. Set WEBHOOK_URL or APP_URL"
    );
    process.exit(1);
  }

  console.log(`Setting webhook to: ${webhookUrl}`);
  console.log(`Secret token: ${webhookSecret ? "(set)" : "(not set)"}`);

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        ...(webhookSecret ? { secret_token: webhookSecret } : {}),
        allowed_updates: ["message", "pre_checkout_query", "callback_query"],
      }),
    }
  );

  const json = (await res.json()) as TelegramResponse;
  console.log("Response:", JSON.stringify(json, null, 2));

  if (json.ok) {
    console.log("\n✅ Webhook set successfully!");

    // Also get current webhook info
    const infoRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`
    );
    const infoJson = (await infoRes.json()) as TelegramResponse;
    console.log("\nWebhook info:", JSON.stringify(infoJson.result, null, 2));
  } else {
    console.error("\n❌ Failed to set webhook:", json.description);
    process.exit(1);
  }
}

main().catch(console.error);
