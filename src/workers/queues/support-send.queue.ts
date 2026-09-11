/**
 * Support Send Queue
 *
 * 发送队列：通过 SMTP 发送邮件回复。
 */
import { Queue } from "bullmq";
import { redis } from "@/server/redis";

export const SUPPORT_SEND_QUEUE_NAME = "support-send";

export type SupportSendJobData =
  | { type: "send-reply"; replyId: string }
  | {
      type: "send-reply";
      ticketId: string;
      toEmail: string;
      subject: string;
      body: string;
      bodyHtml?: string;
      inReplyTo?: string;
      references?: string;
    };

export const supportSendQueue = new Queue<SupportSendJobData>(
  SUPPORT_SEND_QUEUE_NAME,
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: { count: 100, age: 24 * 3600 },
      removeOnFail: { count: 500, age: 7 * 24 * 3600 },
    },
  },
);
