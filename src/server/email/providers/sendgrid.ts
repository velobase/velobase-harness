import sgMail from "@sendgrid/mail";
import { logger } from "@/lib/logger";
import { APP_NAME } from "@/config/brand";
import type { EmailProvider, SendEmailParams, SendEmailResult } from "../types";

const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
}

const defaultFrom =
  process.env.EMAIL_FROM ??
  (process.env.NODE_ENV === "production"
    ? undefined
    : `${APP_NAME} <onboarding@resend.dev>`);

export const sendgridProvider: EmailProvider = {
  name: "sendgrid",

  isAvailable() {
    return !!apiKey;
  },

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    if (!apiKey) {
      throw new Error("SENDGRID_API_KEY is missing");
    }

    const to = Array.isArray(params.to) ? params.to : [params.to];
    const from = params.from ?? defaultFrom;
    if (!from) {
      throw new Error("EMAIL_FROM is required in production");
    }

    logger.info({ to, provider: "sendgrid" }, "Sending email via SendGrid");

    const msg = {
      to,
      from,
      subject: params.subject,
      text: params.text ?? "",
      html: params.html,
    };

    try {
      const [response] = await sgMail.send(msg);
      const headers = response.headers as Record<string, string>;
      const messageId = headers["x-message-id"] ?? "unknown";

      logger.info({ to, messageId, provider: "sendgrid" }, "Email sent via SendGrid");
      return { provider: "sendgrid", messageId };
    } catch (error: unknown) {
      const err = error as { response?: { body?: unknown; statusCode?: number } };
      logger.error(
        { to, provider: "sendgrid", statusCode: err.response?.statusCode, body: err.response?.body },
        "SendGrid API error",
      );
      throw new Error(`SendGrid failed: ${JSON.stringify(err.response?.body)}`);
    }
  },
};
