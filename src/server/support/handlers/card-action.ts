/**
 * 处理客诉审核卡片的交互操作
 */

import { createLogger } from "@/lib/logger";
import { MODULES } from "@/config/modules";
import type { CardActionEventData } from "@/lib/lark/event-handler";
import type { LarkCard } from "@/lib/lark";
import { approveDraft, rejectDraft } from "../services/approve-draft";
import { supportSendQueue } from "@/workers/queues/support-send.queue";
import { updateTicketStatus } from "../services/update-status";
import { env } from "@/env";

const logger = createLogger("support-card-action");

interface SupportCardActionValue {
  action: "approve" | "reject";
  ticketId: string;
}

/**
 * 处理客诉审核卡片的按钮点击
 * 返回一个更新后的卡片来替换原卡片
 */
export async function handleSupportCardAction(
  data: CardActionEventData,
): Promise<LarkCard | undefined> {
  if (!MODULES.features.supportAutomation.enabled) {
    logger.warn(
      "Ignoring support card action because support automation is disabled",
    );
    return undefined;
  }

  const actionValue = data.action.value as unknown as SupportCardActionValue;
  const { action, ticketId } = actionValue;
  const operatorId = data.open_id;

  logger.info(
    { ticketId, action, operatorId },
    "Processing support card action",
  );

  try {
    if (action === "approve") {
      // 批准草稿
      const result = await approveDraft(ticketId, operatorId);

      if (!result) {
        return buildResultCard(
          "error",
          ticketId,
          operatorId,
          "未找到待审核的草稿",
        );
      }

      // 加入发送队列
      await supportSendQueue.add(
        `send-${ticketId}`,
        {
          type: "send-reply",
          ticketId,
          toEmail: result.toEmail,
          subject: "Re: Your Support Request", // TODO: 从工单获取主题
          body: result.reply,
          inReplyTo: result.inReplyTo,
          references: result.references,
        },
        { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
      );

      // 更新状态为 WAITING
      await updateTicketStatus({ ticketId, status: "WAITING" });

      return buildResultCard("approved", ticketId, operatorId);
    } else if (action === "reject") {
      // 拒绝草稿
      const success = await rejectDraft(ticketId, operatorId, "人工拒绝");

      if (success) {
        // 更新状态为 OPEN，等待人工处理
        await updateTicketStatus({ ticketId, status: "OPEN" });
        return buildResultCard("rejected", ticketId, operatorId);
      } else {
        return buildResultCard(
          "error",
          ticketId,
          operatorId,
          "未找到待审核的草稿",
        );
      }
    }

    return undefined;
  } catch (err) {
    logger.error(
      { err, ticketId, action },
      "Failed to process support card action",
    );
    return buildResultCard(
      "error",
      ticketId,
      operatorId,
      "处理失败，请稍后重试",
    );
  }
}

/**
 * 构建操作结果卡片（替换原审核卡片）
 */
function buildResultCard(
  status: "approved" | "rejected" | "error",
  ticketId: string,
  operatorId: string,
  errorMessage?: string,
): LarkCard {
  const statusConfig = {
    approved: {
      title: "✅ 已批准发送",
      color: "green" as const,
      message: "AI 回复已发送给用户",
    },
    rejected: {
      title: "❌ 已拒绝",
      color: "red" as const,
      message: "已标记为需要人工处理",
    },
    error: {
      title: "⚠️ 操作失败",
      color: "orange" as const,
      message: errorMessage ?? "处理时发生错误",
    },
  };

  const config = statusConfig[status];
  const CALLBACK_BASE_URL = env.APP_URL ?? "https://example.com";

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: "plain_text",
        content: config.title,
      },
      template: config.color,
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: config.message,
        },
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: `操作人: ${operatorId} | 工单: ${ticketId}`,
          },
        ],
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: {
              tag: "plain_text",
              content: "查看详情",
            },
            type: "default",
            url: `${CALLBACK_BASE_URL}/admin/support/${ticketId}`,
          },
        ],
      },
    ],
  };
}
