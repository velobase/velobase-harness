/**
 * Lark Notify Provider - 飞书话题通知
 * 
 * 每个工单对应一个飞书话题（Thread）：
 * - 第一条消息 = 工单摘要（创建话题）
 * - 后续消息 = 回复到话题（AI 分析、审核卡片、状态更新等）
 */

import { createLogger } from "@/lib/logger";
import { getLarkBot, LARK_CHAT_IDS } from "@/lib/lark";
import type { LarkCard, LarkElement } from "@/lib/lark";
import type { LarkApprovalCardData, TicketCategory } from "../types";
import { db } from "@/server/db";
import { env } from "@/env";

const logger = createLogger("support-lark-notify");

// 回调 URL（飞书卡片点击后回调的地址）
const CALLBACK_BASE_URL = env.APP_URL ?? "https://example.com";

/**
 * 分类对应的 emoji 和颜色
 */
const CATEGORY_CONFIG: Record<TicketCategory, { emoji: string; color: "red" | "orange" | "yellow" | "purple" | "blue" | "grey" | "green" }> = {
  CANCEL: { emoji: "🚫", color: "red" },
  REFUND: { emoji: "💰", color: "orange" },
  BILLING: { emoji: "💳", color: "yellow" },
  BUG: { emoji: "🐛", color: "purple" },
  HOWTO: { emoji: "❓", color: "blue" },
  OTHER: { emoji: "📝", color: "grey" },
};

/**
 * 截断文本
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + "...";
}

// ============================================================
// 话题管理
// ============================================================

/**
 * 创建工单话题（第一条消息）
 * 返回 threadId (message_id)，需要保存到 SupportTicket.feishuThreadId
 */
export async function createTicketThread(
  ticketId: string,
  userEmail: string,
  subject: string,
  originalMessage: string,
  category?: TicketCategory
): Promise<string | null> {
  try {
    const bot = getLarkBot();
    const config = category ? CATEGORY_CONFIG[category] : CATEGORY_CONFIG.OTHER;

    // 构建话题第一条消息（工单摘要卡片）
    const card: LarkCard = {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          tag: "plain_text",
          content: `${config.emoji} [${category ?? "NEW"}] ${truncateText(subject, 40)}`,
        },
        template: config.color,
      },
      elements: [
        {
          tag: "div",
          fields: [
            {
              is_short: true,
              text: {
                tag: "lark_md",
                content: `**用户**\n${userEmail}`,
              },
            },
            {
              is_short: true,
              text: {
                tag: "lark_md",
                content: `**工单 ID**\n\`${ticketId.slice(0, 8)}\``,
              },
            },
          ],
        },
        { tag: "hr" },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**原始邮件**\n${truncateText(originalMessage, 800)}`,
          },
        },
        {
          tag: "note",
          elements: [
            {
              tag: "plain_text",
              content: "🤖 AI 正在处理中...",
            },
          ],
        },
      ],
    };

    const res = await bot.sendCard(LARK_CHAT_IDS.SUPPORT, card);
    const threadId = res.data?.message_id;

    if (!threadId) {
      logger.error({ ticketId, res }, "Failed to get thread ID from response");
      return null;
    }

    // 保存 threadId 到工单
    await db.supportTicket.update({
      where: { id: ticketId },
      data: { feishuThreadId: threadId },
    });

    logger.info({ ticketId, threadId }, "Ticket thread created");
    return threadId;
  } catch (err) {
    logger.error({ err, ticketId }, "Failed to create ticket thread");
    return null;
  }
}

/**
 * 获取工单的话题 ID
 */
async function getThreadId(ticketId: string): Promise<string | null> {
  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    select: { feishuThreadId: true },
  });
  return ticket?.feishuThreadId ?? null;
}

// ============================================================
// 话题内回复
// ============================================================

/**
 * 发送审核卡片到话题
 */
export async function sendApprovalCard(data: LarkApprovalCardData): Promise<boolean> {
  try {
    const threadId = await getThreadId(data.ticketId);
    if (!threadId) {
      logger.warn({ ticketId: data.ticketId }, "No thread ID found, creating new thread");
      // 如果没有话题，先创建
      await createTicketThread(
        data.ticketId,
        data.userEmail,
        data.subject,
        data.originalMessage,
        data.category
      );
      // 重新获取
      const newThreadId = await getThreadId(data.ticketId);
      if (!newThreadId) {
        logger.error({ ticketId: data.ticketId }, "Still no thread ID after creation");
        return false;
      }
      return sendApprovalCardToThread(newThreadId, data);
    }

    return sendApprovalCardToThread(threadId, data);
  } catch (err) {
    logger.error({ err, ticketId: data.ticketId }, "Failed to send approval card");
    return false;
  }
}

/**
 * 发送审核卡片到指定话题
 */
async function sendApprovalCardToThread(threadId: string, data: LarkApprovalCardData): Promise<boolean> {
  try {
    const bot = getLarkBot();
    const config = CATEGORY_CONFIG[data.category] ?? CATEGORY_CONFIG.OTHER;
    const confidencePercent = Math.round(data.confidence * 100);

    const elements: LarkElement[] = [
      {
        tag: "div",
        fields: [
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**分类**\n${config.emoji} ${data.category}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**置信度**\n${confidencePercent}%`,
            },
          },
        ],
      },
      { tag: "hr" },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**AI 拟回复**\n${truncateText(data.proposedReply, 800)}`,
        },
      },
    ];

    // 如果有拟执行的操作
    if (data.proposedActions && data.proposedActions.length > 0) {
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**拟执行操作**\n${data.proposedActions.map((a) => `• ${a.description}`).join("\n")}`,
        },
      });
    }

    elements.push({ tag: "hr" });

    // 操作按钮
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: {
            tag: "plain_text",
            content: "✅ 批准",
          },
          type: "primary",
          value: {
            action: "approve",
            ticketId: data.ticketId,
          },
        },
        {
          tag: "button",
          text: {
            tag: "plain_text",
            content: "✏️ 编辑",
          },
          type: "default",
          url: `${CALLBACK_BASE_URL}/admin/support/${data.ticketId}`,
        },
        {
          tag: "button",
          text: {
            tag: "plain_text",
            content: "❌ 拒绝",
          },
          type: "danger",
          value: {
            action: "reject",
            ticketId: data.ticketId,
          },
        },
      ],
    });

    const card: LarkCard = {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          tag: "plain_text",
          content: "📋 待审核",
        },
        template: "orange",
      },
      elements,
    };

    await bot.replyCard(threadId, card);

    logger.info({ ticketId: data.ticketId, threadId }, "Approval card sent to thread");
    return true;
  } catch (err) {
    logger.error({ err, ticketId: data.ticketId, threadId }, "Failed to send approval card to thread");
    return false;
  }
}

/**
 * 发送状态更新到话题
 */
export async function sendStatusUpdate(
  ticketId: string,
  status: "approved" | "rejected" | "sent" | "error",
  message?: string
): Promise<boolean> {
  try {
    const threadId = await getThreadId(ticketId);
    if (!threadId) {
      logger.warn({ ticketId }, "No thread ID found for status update");
      return false;
    }

    const bot = getLarkBot();

    const statusConfig = {
      approved: { emoji: "✅", text: "已批准", color: "green" as const },
      rejected: { emoji: "❌", text: "已拒绝", color: "red" as const },
      sent: { emoji: "📤", text: "邮件已发送", color: "green" as const },
      error: { emoji: "⚠️", text: "处理失败", color: "orange" as const },
    };

    const config = statusConfig[status];

    const card: LarkCard = {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          tag: "plain_text",
          content: `${config.emoji} ${config.text}`,
        },
        template: config.color,
      },
      elements: message
        ? [
            {
              tag: "div",
              text: {
                tag: "lark_md",
                content: message,
              },
            },
          ]
        : [],
    };

    await bot.replyCard(threadId, card);

    logger.info({ ticketId, threadId, status }, "Status update sent to thread");
    return true;
  } catch (err) {
    logger.error({ err, ticketId, status }, "Failed to send status update");
    return false;
  }
}

/**
 * 发送文本消息到话题
 */
export async function sendThreadMessage(ticketId: string, text: string): Promise<boolean> {
  try {
    const threadId = await getThreadId(ticketId);
    if (!threadId) {
      logger.warn({ ticketId }, "No thread ID found for message");
      return false;
    }

    const bot = getLarkBot();
    await bot.replyText(threadId, text);

    logger.info({ ticketId, threadId }, "Message sent to thread");
    return true;
  } catch (err) {
    logger.error({ err, ticketId }, "Failed to send message to thread");
    return false;
  }
}

// ============================================================
// Agent 处理过程卡片
// ============================================================

/**
 * Agent 处理结果数据
 */
export interface AgentProcessingData {
  ticketId: string;
  // 已执行的工具调用
  executedTools: Array<{
    name: string;
    args: Record<string, unknown>;
    result: unknown;
  }>;
  // 待审批的工具调用
  pendingApprovals: Array<{
    toolName: string;
    args: Record<string, unknown>;
    description: string;
  }>;
  // 最终回复
  reply: string;
  // 是否需要审批
  needsApproval: boolean;
}

/**
 * 工具名称的中英文映射
 */
const TOOL_NAME_MAP: Record<string, { emoji: string; name: string }> = {
  query_subscription: { emoji: "🔍", name: "查询订阅" },
  query_credits: { emoji: "💰", name: "查询积分" },
  query_orders: { emoji: "📦", name: "查询订单" },
  cancel_subscription: { emoji: "🚫", name: "取消订阅" },
  refund_order: { emoji: "💸", name: "退款" },
  add_blur_bypass: { emoji: "🎬", name: "解除模糊" },
  add_credits: { emoji: "🎁", name: "赠送积分" },
};

/**
 * 格式化工具参数为可读字符串
 */
function formatToolArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args).filter(([k, v]) => !k.startsWith("_") && v !== undefined);
  if (entries.length === 0) return "无参数";
  return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
}

/**
 * 格式化工具结果为可读字符串
 */
function formatToolResult(result: unknown): string {
  if (result === null || result === undefined) return "无结果";
  if (typeof result === "object") {
    // 检查是否是错误
    if ("error" in (result as Record<string, unknown>)) {
      return `❌ ${(result as { error: string }).error}`;
    }
    // 格式化关键字段
    const obj = result as Record<string, unknown>;
    const keyFields = ["status", "plan", "planName", "available", "totalCredits", "ordersCount", "success"];
    const summary = keyFields
      .filter((k) => k in obj)
      .map((k) => `${k}: ${JSON.stringify(obj[k])}`)
      .join(", ");
    return summary || JSON.stringify(result).slice(0, 200);
  }
  return JSON.stringify(result).slice(0, 200);
}

/**
 * 发送 Agent 处理过程卡片
 * 展示完整的 AI 思考、工具调用、回复
 */
export async function sendAgentProcessingCard(data: AgentProcessingData): Promise<boolean> {
  try {
    const threadId = await getThreadId(data.ticketId);
    if (!threadId) {
      logger.warn({ ticketId: data.ticketId }, "No thread ID found for agent processing card");
      return false;
    }

    const bot = getLarkBot();
    const elements: LarkElement[] = [];

    // 1. 已执行的工具调用（信息收集阶段）
    if (data.executedTools.length > 0) {
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: "**🔍 信息收集**",
        },
      });

      for (const tool of data.executedTools) {
        const toolInfo = TOOL_NAME_MAP[tool.name] ?? { emoji: "🔧", name: tool.name };
        elements.push({
          tag: "div",
          text: {
            tag: "lark_md",
            content: `${toolInfo.emoji} **${toolInfo.name}**\n\`参数\`: ${formatToolArgs(tool.args)}\n\`结果\`: ${formatToolResult(tool.result)}`,
          },
        });
      }

      elements.push({ tag: "hr" });
    }

    // 2. 待审批的动作
    if (data.pendingApprovals.length > 0) {
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: "**⚠️ 待执行动作（需审批）**",
        },
      });

      for (const action of data.pendingApprovals) {
        const toolInfo = TOOL_NAME_MAP[action.toolName] ?? { emoji: "🔧", name: action.toolName };
        elements.push({
          tag: "div",
          text: {
            tag: "lark_md",
            content: `${toolInfo.emoji} **${toolInfo.name}**\n${action.description}\n\`参数\`: ${formatToolArgs(action.args)}`,
          },
        });
      }

      elements.push({ tag: "hr" });
    }

    // 3. AI 生成的回复
    if (data.reply) {
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: "**💬 AI 回复草稿**",
        },
      });

      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: truncateText(data.reply, 1500),
        },
      });
    }

    // 4. 状态总结
    const statusText = data.needsApproval
      ? `⏳ **待审批** - 有 ${data.pendingApprovals.length} 个动作需要人工确认`
      : "✅ **已自动处理** - 回复已发送";

    elements.push({
      tag: "note",
      elements: [
        {
          tag: "plain_text",
          content: statusText,
        },
      ],
    });

    // 构建卡片
    const card: LarkCard = {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          tag: "plain_text",
          content: data.needsApproval ? "🤖 Agent 分析完成 - 待审批" : "🤖 Agent 处理完成",
        },
        template: data.needsApproval ? "orange" : "green",
      },
      elements,
    };

    await bot.replyCard(threadId, card);

    logger.info(
      {
        ticketId: data.ticketId,
        executedTools: data.executedTools.length,
        pendingApprovals: data.pendingApprovals.length,
        needsApproval: data.needsApproval,
      },
      "Agent processing card sent"
    );

    return true;
  } catch (err) {
    logger.error({ err, ticketId: data.ticketId }, "Failed to send agent processing card");
    return false;
  }
}

// ============================================================
// 兼容旧接口（可选，逐步废弃）
// ============================================================

/**
 * @deprecated 使用 createTicketThread 替代
 */
export async function sendNewTicketNotification(
  ticketId: string,
  userEmail: string,
  subject: string,
  preview: string
): Promise<boolean> {
  const threadId = await createTicketThread(ticketId, userEmail, subject, preview);
  return threadId !== null;
}

/**
 * @deprecated 使用 sendStatusUpdate 替代
 */
export async function sendAutoProcessedNotification(
  ticketId: string,
  userEmail: string,
  category: TicketCategory,
  summary: string
): Promise<boolean> {
  return sendStatusUpdate(ticketId, "sent", `**用户**: ${userEmail}\n**分类**: ${category}\n**摘要**: ${summary}`);
}
