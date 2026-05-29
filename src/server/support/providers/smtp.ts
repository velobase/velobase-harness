/**
 * SMTP Provider - 通过飞书 SMTP 发送邮件
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from "@/lib/logger";
import { APP_NAME, SUPPORT_EMAIL } from "@/config/brand";

// 飞书 SMTP 配置
const SMTP_CONFIG = {
  host: process.env.SUPPORT_SMTP_HOST ?? "smtp.larksuite.com",
  port: parseInt(process.env.SUPPORT_SMTP_PORT ?? "465", 10),
  secure: true,
  auth: {
    user: process.env.SUPPORT_EMAIL_ADDRESS ?? SUPPORT_EMAIL,
    pass: process.env.SUPPORT_EMAIL_PASSWORD ?? "",
  },
};

const FROM_ADDRESS = process.env.SUPPORT_EMAIL_FROM ?? `${APP_NAME} Support <${SUPPORT_EMAIL}>`;

let transporter: Transporter | null = null;

/**
 * 获取或创建 SMTP transporter
 */
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport(SMTP_CONFIG);
  }
  return transporter;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
}

export interface SendEmailResult {
  messageId: string;
  success: boolean;
  error?: string;
}

/**
 * 发送邮件
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!SMTP_CONFIG.auth.pass) {
    logger.warn("SUPPORT_EMAIL_PASSWORD not configured, skipping email send");
    return {
      messageId: "",
      success: false,
      error: "SMTP not configured",
    };
  }

  try {
    const transport = getTransporter();

    const mailOptions: nodemailer.SendMailOptions = {
      from: FROM_ADDRESS,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    };

    // 设置回复线程头
    if (params.inReplyTo) {
      mailOptions.inReplyTo = params.inReplyTo;
    }
    if (params.references) {
      mailOptions.references = params.references;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const info = await transport.sendMail(mailOptions);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const messageId = info.messageId as string;

    logger.info(
      { to: params.to, messageId },
      "Email sent successfully"
    );

    return {
      messageId,
      success: true,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: params.to }, "Failed to send email");

    return {
      messageId: "",
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 生成回复邮件的 HTML 模板
 */
export function generateReplyHtml(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
      line-height: 1.6; 
      color: #333; 
      max-width: 600px; 
      margin: 0 auto; 
      padding: 20px; 
    }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #f97316; }
    .content { background: #fafafa; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
    a { color: #f97316; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">${APP_NAME}</div>
  </div>
  
  <div class="content">
    ${content.split("\n").map((line) => `<p>${line}</p>`).join("")}
  </div>
  
  <div class="footer">
    <p>${APP_NAME}</p>
    <p><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
  </div>
</body>
</html>
  `.trim();
}
