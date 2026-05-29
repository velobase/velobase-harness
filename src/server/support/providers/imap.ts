/**
 * IMAP Provider - 从飞书邮箱拉取邮件
 * 
 * 注意：需要安装依赖：pnpm add imap mailparser
 * 以及类型声明：pnpm add -D @types/imap @types/mailparser
 */

import Imap from "imap";
import { simpleParser } from "mailparser";
import type { ParsedMail } from "mailparser";
import { Readable } from "stream";
import { logger } from "@/lib/logger";
import type { ParsedEmail } from "../types";
import { SUPPORT_EMAIL } from "@/config/brand";

// Helper function to parse email
async function parseEmail(stream: NodeJS.ReadableStream): Promise<ParsedMail | null> {
  try {
    // Convert to Node.js Readable stream for mailparser
    const readable = Readable.from(stream as AsyncIterable<Buffer>);
    const result = await simpleParser(readable);
    return result;
  } catch {
    return null;
  }
}

interface ImapBox {
  messages: { total: number };
  uidnext?: number;
}

// 飞书 IMAP 配置
const IMAP_CONFIG = {
  user: process.env.SUPPORT_EMAIL_ADDRESS ?? SUPPORT_EMAIL,
  password: process.env.SUPPORT_EMAIL_PASSWORD ?? "",
  host: process.env.SUPPORT_IMAP_HOST ?? "imap.larksuite.com",
  port: parseInt(process.env.SUPPORT_IMAP_PORT ?? "993", 10),
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
};

/**
 * 创建 IMAP 连接
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createImapConnection(): any {
  return new Imap(IMAP_CONFIG) as unknown;
}

/**
 * 从 AddressObject 或 AddressObject[] 提取邮箱地址
 */
function extractAddresses(addressField: ParsedMail["to"]): string[] {
  if (!addressField) return [];
  
  // mailparser 的 to/cc 可能是 AddressObject 或 AddressObject[]
  const addressObjects = Array.isArray(addressField) ? addressField : [addressField];
  
  return addressObjects
    .flatMap((obj) => obj.value ?? [])
    .map((addr) => addr.address)
    .filter((addr): addr is string => !!addr);
}

/**
 * 将 ParsedMail 转换为我们的 ParsedEmail 格式
 */
function convertToParseEmail(mail: ParsedMail, uid: number): ParsedEmail | null {
  const from = mail.from?.value?.[0];
  if (!from?.address) {
    return null;
  }

  return {
    messageId: mail.messageId ?? `unknown-${uid}`,
    inReplyTo: typeof mail.inReplyTo === "string" ? mail.inReplyTo : undefined,
    references: Array.isArray(mail.references) 
      ? mail.references.join(" ") 
      : mail.references,
    from: {
      address: from.address,
      name: from.name,
    },
    to: extractAddresses(mail.to),
    cc: extractAddresses(mail.cc),
    subject: mail.subject ?? "(No Subject)",
    text: mail.text,
    html: typeof mail.html === "string" ? mail.html : undefined,
    date: mail.date ?? new Date(),
    uid,
  };
}

/**
 * 从 IMAP 拉取新邮件
 * @param sinceUid 从哪个 UID 开始拉取（不包含）
 * @returns 新邮件列表
 */
export async function fetchNewEmails(sinceUid: number): Promise<ParsedEmail[]> {
  if (!IMAP_CONFIG.password) {
    logger.warn("SUPPORT_EMAIL_PASSWORD not configured, skipping IMAP fetch");
    return [];
  }

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const imap = createImapConnection();
    const emails: ParsedEmail[] = [];

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    imap.once("ready", () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      imap.openBox("INBOX", false, (err: Error | null, box: ImapBox) => {
        if (err) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          imap.end();
          reject(err);
          return;
        }

        logger.info(
          { totalMessages: box.messages.total, sinceUid },
          "IMAP inbox opened"
        );

        // 搜索 UID 大于 sinceUid 的邮件
        const searchCriteria = sinceUid > 0 ? [["UID", `${sinceUid + 1}:*`]] : ["ALL"];

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        imap.search(searchCriteria, (searchErr: Error | null, results: number[]) => {
          if (searchErr) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            imap.end();
            reject(searchErr);
            return;
          }

          // 过滤掉 sinceUid 本身（IMAP range 是 inclusive）
          const filteredResults = results.filter((uid: number) => uid > sinceUid);

          if (filteredResults.length === 0) {
            logger.info("No new emails found");
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            imap.end();
            resolve([]);
            return;
          }

          logger.info({ count: filteredResults.length }, "Found new emails");

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
          const fetch = imap.fetch(filteredResults, {
            bodies: "",
            struct: true,
          });

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
          fetch.on("message", (msg: any, seqno: number) => {
            let uid = 0;

            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
            msg.on("attributes", (attrs: any) => {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              uid = attrs.uid;
            });

            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
            msg.on("body", (stream: any) => {
              void parseEmail(stream as NodeJS.ReadableStream).then((parsed) => {
                if (parsed) {
                  const email = convertToParseEmail(parsed, uid);
                  if (email) {
                    emails.push(email);
                  }
                }
              }).catch((parseErr: unknown) => {
                logger.error({ err: parseErr, seqno }, "Failed to parse email");
              });
            });
          });

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          fetch.once("error", (fetchErr: Error) => {
            logger.error({ err: fetchErr }, "IMAP fetch error");
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            imap.end();
            reject(fetchErr);
          });

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          fetch.once("end", () => {
            logger.info({ count: emails.length }, "Finished fetching emails");
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            imap.end();
            // 按 UID 排序
            emails.sort((a, b) => a.uid - b.uid);
            resolve(emails);
          });
        });
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    imap.once("error", (err: Error) => {
      logger.error({ err }, "IMAP connection error");
      reject(err);
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    imap.once("end", () => {
      logger.debug("IMAP connection ended");
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    imap.connect();
  });
}

/**
 * 获取邮箱中最大的 UID（用于初始化同步游标）
 */
export async function getMaxUid(): Promise<number> {
  if (!IMAP_CONFIG.password) {
    return 0;
  }

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const imap = createImapConnection();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    imap.once("ready", () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      imap.openBox("INBOX", true, (err: Error | null, box: ImapBox) => {
        if (err) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          imap.end();
          reject(err);
          return;
        }

        // uidnext - 1 就是当前最大的 UID
        const maxUid = box.uidnext ? box.uidnext - 1 : 0;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        imap.end();
        resolve(maxUid);
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    imap.once("error", (err: Error) => {
      reject(err);
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    imap.connect();
  });
}
