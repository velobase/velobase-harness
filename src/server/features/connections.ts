import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { env } from "@/env";
import { db } from "@/server/db";

export const mailboxSchema = z.object({
  address: z.string().email(),
  imapHost: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9.-]+$/),
  imapPort: z.number().int().min(1).max(65535).default(993),
  smtpHost: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9.-]+$/),
  smtpPort: z.number().int().min(1).max(65535).default(465),
  from: z
    .string()
    .max(320)
    .refine((value) => !/[\r\n]/.test(value))
    .optional(),
});
export type MailboxConfig = z.infer<typeof mailboxSchema> & {
  password: string;
};

function key() {
  if (!env.AUTH_SECRET)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "AUTH_SECRET is required to store connection credentials",
    });
  return createHash("sha256")
    .update(`harness-service-connections-v1:${env.AUTH_SECRET}`)
    .digest();
}
function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from("mailbox:v1"));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}
function decrypt(value: string) {
  const [version, iv, tag, content] = value.split(".");
  if (version !== "v1" || !iv || !tag || !content)
    throw new Error("Invalid connection credential envelope");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64"),
  );
  cipher.setAAD(Buffer.from("mailbox:v1"));
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    cipher.update(Buffer.from(content, "base64")),
    cipher.final(),
  ]).toString("utf8");
}

export async function getMailboxConfig(): Promise<MailboxConfig | null> {
  const saved = await db.serviceConnection.findUnique({
    where: { id: "mailbox" },
  });
  if (saved?.secret) {
    return {
      ...mailboxSchema.parse(saved.config),
      password: decrypt(saved.secret),
    };
  }
  if (
    !env.SUPPORT_EMAIL_ADDRESS ||
    !env.SUPPORT_EMAIL_PASSWORD ||
    !env.SUPPORT_IMAP_HOST ||
    !env.SUPPORT_SMTP_HOST
  )
    return null;
  return {
    address: env.SUPPORT_EMAIL_ADDRESS,
    password: env.SUPPORT_EMAIL_PASSWORD,
    imapHost: env.SUPPORT_IMAP_HOST,
    imapPort: env.SUPPORT_IMAP_PORT,
    smtpHost: env.SUPPORT_SMTP_HOST,
    smtpPort: env.SUPPORT_SMTP_PORT,
    from: env.SUPPORT_EMAIL_FROM,
  };
}

export async function mailboxConfigured() {
  const saved = await db.serviceConnection.findUnique({
    where: { id: "mailbox" },
    select: { config: true, secret: true },
  });
  return saved
    ? Boolean(saved.secret && mailboxSchema.safeParse(saved.config).success)
    : Boolean(
        env.SUPPORT_EMAIL_ADDRESS &&
        env.SUPPORT_EMAIL_PASSWORD &&
        env.SUPPORT_IMAP_HOST &&
        env.SUPPORT_SMTP_HOST,
      );
}

export async function mailboxSummary() {
  const config = await getMailboxConfig();
  const saved = await db.serviceConnection.findUnique({
    where: { id: "mailbox" },
    select: { verifiedAt: true },
  });
  // No password, ciphertext or secret length crosses the server boundary.
  return {
    config: config ? mailboxSchema.parse(config) : null,
    configured: Boolean(config),
    verifiedAt: saved?.verifiedAt ?? null,
  };
}

export async function saveMailbox(
  config: z.infer<typeof mailboxSchema>,
  password: string | undefined,
  userId: string,
) {
  const { isFeatureEnabled } = await import("./state");
  if (await isFeatureEnabled("email-management"))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Disable email management before changing its connection",
    });
  if (
    await db.supportReply.count({
      where: { status: { in: ["PENDING", "SENDING"] } },
    })
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Finish or cancel pending replies before changing the mailbox",
    });
  const current = await getMailboxConfig();
  const nextPassword = password || current?.password;
  if (!nextPassword)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Mailbox password is required",
    });
  const secret = encrypt(nextPassword);
  await db.$transaction(async (tx) => {
    const receiving = await tx.supportSyncCursor.findFirst({
      where: { id: "email_inbox", leaseExpiresAt: { gt: new Date() } },
    });
    if (receiving)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Wait for the current mailbox receive to finish",
      });
    if (
      current &&
      (current.address !== config.address ||
        current.imapHost !== config.imapHost)
    ) {
      await tx.supportSyncCursor.deleteMany({ where: { id: "email_inbox" } });
    }
    await tx.serviceConnection.upsert({
      where: { id: "mailbox" },
      create: { id: "mailbox", config, secret, updatedBy: userId },
      update: { config, secret, verifiedAt: null, updatedBy: userId },
    });
  });
  return mailboxSummary();
}

export async function verifyMailboxConnection() {
  const config = await getMailboxConfig();
  if (!config)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Configure the mailbox first",
    });
  const { inspectMailbox, inspectSmtp } = await import("@velobase/mailbox");
  try {
    await Promise.all([inspectMailbox(config), inspectSmtp(config)]);
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Mailbox connection failed. Check the host, TLS port and credentials.",
    });
  }
  await db.serviceConnection.updateMany({
    where: { id: "mailbox" },
    data: { verifiedAt: new Date() },
  });
  return { connected: true };
}
