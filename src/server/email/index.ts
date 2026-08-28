import { logger } from "@/lib/logger";
import { env } from "@/env";
import { resolveProviderChain } from "./providers";
import type { SendEmailParams, SendEmailResult } from "./types";

export type { SendEmailParams, SendEmailResult, EmailProvider } from "./types";
export { MagicLinkEmailTemplate, renderMagicLinkHtml } from "./templates/magic-link";
export { EmailCodeTemplate, renderEmailCodeHtml } from "./templates/email-code";

const providerChain = resolveProviderChain(env.EMAIL_PROVIDER);

if (providerChain.length === 0) {
  logger.warn("No email providers configured — email sending will fail at runtime");
}

/**
 * Send an email using the configured provider chain.
 *
 * Provider priority is controlled by `EMAIL_PROVIDER` env:
 *   "resend"           → Resend only
 *   "sendgrid"         → SendGrid only
 *   "resend,sendgrid"  → Resend first, SendGrid fallback
 *   "sendgrid,resend"  → SendGrid first, Resend fallback
 *
 * If unset, all available providers are tried in registration order.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (providerChain.length === 0) {
    throw new Error("No email providers configured. Set RESEND_API_KEY and/or SENDGRID_API_KEY.");
  }

  const errors: Array<{ provider: string; error: string }> = [];

  for (const provider of providerChain) {
    try {
      return await provider.send(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ provider: provider.name, error: message });

      if (providerChain.length > 1) {
        logger.warn(
          { provider: provider.name, to: params.to, error: message },
          `Email provider "${provider.name}" failed, trying next`,
        );
      }
    }
  }

  logger.error(
    { to: params.to, errors },
    "All email providers failed",
  );
  throw new Error(
    `All email providers failed: ${errors.map((e) => `[${e.provider}] ${e.error}`).join("; ")}`,
  );
}
