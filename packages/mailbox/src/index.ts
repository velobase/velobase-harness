import Imap from "imap";
import { simpleParser, type ParsedMail } from "mailparser";
export {
  inspectSmtp,
  sendSmtpEmail as sendMailboxEmail,
} from "@velobase/email-transport";
export type { OutgoingEmail } from "@velobase/email-transport";

export interface MailboxConfig {
  address: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  from?: string;
}
export interface IncomingEmail {
  messageId: string;
  inReplyTo?: string;
  references?: string;
  from: { address: string; name?: string };
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  date: Date;
  uid: number;
}

async function openInbox(config: MailboxConfig) {
  const connection = new Imap({
    user: config.address,
    password: config.password,
    host: config.imapHost,
    port: config.imapPort,
    tls: true,
    tlsOptions: { rejectUnauthorized: true },
    connTimeout: 15000,
    authTimeout: 15000,
    socketTimeout: 30000,
  });
  const box = await new Promise<Imap.Box>((resolve, reject) => {
    connection.once("error", reject);
    connection.once("end", () => reject(new Error("IMAP connection closed")));
    connection.once("ready", () =>
      connection.openBox("INBOX", true, (error, inbox) => {
        if (error) {
          connection.end();
          reject(error);
        } else resolve(inbox);
      }),
    );
    connection.connect();
  }).catch((error: unknown) => {
    connection.destroy();
    throw error;
  });
  return { connection, box };
}

export async function inspectMailbox(config: MailboxConfig) {
  const { connection, box } = await openInbox(config);
  connection.end();
  return {
    lastUid: Math.max(0, box.uidnext - 1),
    uidValidity: String(box.uidvalidity),
  };
}

function addresses(value: ParsedMail["to"]) {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((item) => item.value)
    .map((item) => item.address)
    .filter((item): item is string => Boolean(item));
}

/** A bounded batch. Await every body parser before advancing the durable cursor. */
export async function readMailbox(
  config: MailboxConfig,
  cursor: { lastUid: number; uidValidity?: string | null },
) {
  const { connection, box } = await openInbox(config);
  try {
    const uidValidity = String(box.uidvalidity);
    const lastUid =
      cursor.uidValidity && cursor.uidValidity !== uidValidity
        ? 0
        : cursor.lastUid;
    const found = await new Promise<number[]>((resolve, reject) => {
      const error = (cause: Error) => reject(cause);
      connection.once("error", error);
      const closed = () =>
        reject(new Error("IMAP connection closed during search"));
      connection.once("end", closed);
      connection.search([["UID", `${lastUid + 1}:*`]], (cause, values) => {
        connection.removeListener("error", error);
        connection.removeListener("end", closed);
        if (cause) reject(cause);
        else
          resolve(
            values
              .filter((uid) => uid > lastUid)
              .sort((a, b) => a - b)
              .slice(0, 50),
          );
      });
    });
    if (!found.length) return { messages: [], uidValidity, lastUid };
    const messages = await new Promise<IncomingEmail[]>((resolve, reject) => {
      const pending: Promise<IncomingEmail>[] = [];
      const onError = (error: Error) => reject(error);
      connection.once("error", onError);
      const onEnd = () =>
        reject(new Error("IMAP connection closed during fetch"));
      connection.once("end", onEnd);
      const fetch = connection.fetch(found, { bodies: "", markSeen: false });
      fetch.on("message", (message) => {
        const parsed = new Promise<IncomingEmail>(
          (resolveMessage, rejectMessage) => {
            let uid = 0;
            let body: Promise<ParsedMail> | undefined;
            message.on("attributes", (attributes) => {
              uid = attributes.uid;
            });
            message.on("body", (stream) => {
              body = new Promise<ParsedMail>((resolveBody, rejectBody) => {
                const chunks: Buffer[] = [];
                let size = 0;
                stream.on("data", (chunk: Buffer) => {
                  size += chunk.length;
                  if (size > 10 * 1024 * 1024) {
                    rejectBody(
                      new Error(
                        "Message exceeds 10 MiB; move it out of the inbox to continue",
                      ),
                    );
                    stream.resume();
                    return;
                  }
                  chunks.push(chunk);
                });
                stream.once("error", rejectBody);
                stream.once("end", () => {
                  void simpleParser(Buffer.concat(chunks)).then(
                    resolveBody,
                    rejectBody,
                  );
                });
              });
              // Attach a rejection handler immediately; the message end consumes the result.
              void body.catch(() => undefined);
            });
            message.once("end", () => {
              if (!body) {
                rejectMessage(new Error("Mail body missing"));
                return;
              }
              void body
                .then((mail) => {
                  const sender = mail.from?.value[0];
                  if (!sender?.address)
                    throw new Error(`Mail ${uid} has no sender`);
                  return {
                    uid,
                    messageId:
                      mail.messageId ??
                      `<${uidValidity}.${uid}@${config.imapHost}>`,
                    inReplyTo: mail.inReplyTo,
                    references: Array.isArray(mail.references)
                      ? mail.references.join(" ")
                      : mail.references,
                    from: { address: sender.address, name: sender.name },
                    to: addresses(mail.to),
                    cc: addresses(mail.cc),
                    subject: mail.subject ?? "",
                    text: mail.text ?? "",
                    date: mail.date ?? new Date(),
                  };
                })
                .then(resolveMessage, rejectMessage);
            });
          },
        );
        void parsed.catch(() => undefined);
        pending.push(parsed);
      });
      fetch.once("error", reject);
      fetch.once("end", () => {
        void Promise.all(pending)
          .then((items) => resolve(items.sort((a, b) => a.uid - b.uid)), reject)
          .finally(() => {
            connection.removeListener("error", onError);
            connection.removeListener("end", onEnd);
          });
      });
    });
    return { messages, uidValidity, lastUid };
  } finally {
    connection.end();
  }
}
