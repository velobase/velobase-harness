import nodemailer from "nodemailer";
export interface SmtpConfig {
  address: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
  from?: string;
}
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  messageId?: string;
}

function smtp(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    requireTLS: config.smtpPort !== 465,
    tls: { rejectUnauthorized: true },
    auth: { user: config.address, pass: config.password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
}
export async function inspectSmtp(config: SmtpConfig) {
  const transport = smtp(config);
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}
export async function sendSmtpEmail(
  config: SmtpConfig,
  message: OutgoingEmail,
): Promise<string> {
  const transport = smtp(config);
  try {
    const info = await transport.sendMail({
      ...message,
      from: config.from || config.address,
    });
    if (!info.accepted?.length)
      throw new Error("SMTP did not accept the recipient");
    return String(info.messageId);
  } finally {
    transport.close();
  }
}
