import { isFeatureEnabled } from "@/server/features/state";
/**
 * Support Process Processor
 *
 * AI Agent 处理工单：使用 Tool Calling 自主查询和决策。
 */

import type { Job } from "bullmq";
import { createLogger } from "@/lib/logger";
import { db } from "@/server/db";
import type { SupportProcessJobData } from "../../queues/support-process.queue";
import { supportSendQueue } from "../../queues/support-send.queue";
import { runSupportAgent } from "@/server/support/ai";
import {
  getOrCreateConversation,
  loadConversationHistory,
  saveUserMessage,
  saveAgentSteps,
  addDraftEvent,
  updateTicketStatus,
} from "@/server/support/services";
import {
  sendApprovalCard,
  sendStatusUpdate,
  sendAgentProcessingCard,
  createTicketThread,
  generateReplyHtml,
} from "@/server/support/providers";

const logger = createLogger("support-process");

export async function processSupportProcessJob(
  job: Job<SupportProcessJobData>,
): Promise<void> {
  if (
    job.data.type !== "process-ticket" ||
    !(await isFeatureEnabled("ai-support"))
  )
    return;

  const { ticketId } = job.data;

  logger.info({ ticketId }, "Processing ticket with Agent");

  try {
    // 1. 获取工单和最新消息
    const ticket = await db.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        timeline: {
          where: { type: "MESSAGE", actor: "USER" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!ticket) {
      logger.warn({ ticketId }, "Ticket not found");
      return;
    }

    if (ticket.status !== "OPEN" || ticket.assignedTo === "AGENT") {
      logger.info(
        { ticketId, status: ticket.status },
        "Ticket not in OPEN status, skipping",
      );
      return;
    }

    const latestMessage = ticket.timeline[0];
    if (!latestMessage) {
      logger.warn({ ticketId }, "No user message found");
      return;
    }

    const messageContent = latestMessage.content ?? "";
    const subject = ticket.subject ?? "(No Subject)";

    // 2. 创建飞书话题（如果还没有）
    if (!ticket.feishuThreadId) {
      await createTicketThread(
        ticketId,
        ticket.contact,
        subject,
        messageContent,
        // category 是可选的，Agent 会自行分类
      );
    }

    // 3. 获取或创建 Conversation
    const conversationId = await getOrCreateConversation(ticketId);

    // 4. 加载会话历史
    const previousMessages = await loadConversationHistory(conversationId);

    // 5. 保存用户消息到 Conversation（如果是第一条）
    if (previousMessages.length === 0) {
      await saveUserMessage(
        conversationId,
        `Subject: ${subject}\n\n${messageContent}`,
        { ticketId, email: ticket.contact },
      );
    }

    // 6. 获取用户上下文（简化版，Agent 会自己通过工具查询更多）
    const userContext = ticket.userId
      ? {
          userId: ticket.userId,
          email: ticket.contact,
          createdAt: new Date(), // placeholder, Agent 会查询实际数据
        }
      : null;

    // 7. 运行 Agent
    const agentResult = await runSupportAgent(
      subject,
      messageContent,
      userContext,
      previousMessages.length > 0 ? previousMessages : undefined,
    );

    // 8. 保存 Agent 步骤到 Conversation
    if (agentResult.steps.length > 0) {
      await saveAgentSteps(
        conversationId,
        agentResult.steps as Parameters<typeof saveAgentSteps>[1],
        agentResult.reply,
      );
    }

    logger.info(
      {
        ticketId,
        executedTools: agentResult.executedTools.length,
        pendingApprovals: agentResult.pendingApprovals.length,
        replyLength: agentResult.reply.length,
      },
      "Agent completed",
    );

    // 9. 检查是否需要审核
    if (agentResult.needsApproval) {
      // 构建待审批操作列表（包含 description）
      const proposedActions = agentResult.pendingApprovals.map((p) => ({
        tool: p.toolName,
        args: p.args,
        description: p.description,
      }));

      await addDraftEvent(
        ticketId,
        agentResult.reply,
        0.5, // Agent 有待审批操作，置信度降低
        proposedActions,
        `Agent proposes ${agentResult.pendingApprovals.length} action(s) requiring approval`,
      );

      // 更新状态
      await updateTicketStatus({
        ticketId,
        status: "NEEDS_APPROVAL",
        assignedTo: "AGENT",
      });

      // 发送 Agent 处理过程卡片（展示完整的思考和工具调用）
      await sendAgentProcessingCard({
        ticketId,
        executedTools: agentResult.executedTools,
        pendingApprovals: agentResult.pendingApprovals,
        reply: agentResult.reply,
        needsApproval: true,
      });

      // 发送审核卡片（包含批准/拒绝按钮）
      await sendApprovalCard({
        ticketId,
        userEmail: ticket.contact,
        subject,
        category: "OTHER",
        confidence: 0.5,
        originalMessage: messageContent.slice(0, 500),
        proposedReply: agentResult.reply,
        proposedActions,
      });

      logger.info(
        { ticketId, pendingApprovals: agentResult.pendingApprovals.length },
        "Ticket needs approval for actions",
      );
      return;
    }

    // 10. 检查回复是否有效
    if (!agentResult.reply || agentResult.reply.trim().length < 10) {
      // Agent 没有生成有效回复，需要人工处理
      await updateTicketStatus({
        ticketId,
        status: "NEEDS_APPROVAL",
        assignedTo: "AGENT",
      });

      await sendStatusUpdate(
        ticketId,
        "error",
        "⚠️ Agent 无法生成有效回复，请人工处理",
      );

      logger.warn({ ticketId }, "Agent generated empty/invalid reply");
      return;
    }

    // 11. 自动发送回复
    const emailMeta = latestMessage.metadata as {
      messageId?: string;
      references?: string;
    } | null;

    // 入发送队列
    await supportSendQueue.add(
      `send-${ticketId}`,
      {
        type: "send-reply",
        ticketId,
        toEmail: ticket.contact,
        subject: `Re: ${subject}`,
        body: agentResult.reply,
        bodyHtml: generateReplyHtml(agentResult.reply),
        inReplyTo: emailMeta?.messageId,
        references: emailMeta?.references ?? emailMeta?.messageId,
      },
      {
        jobId: `send-${ticketId}-${Date.now()}`,
      },
    );

    // 发送 Agent 处理过程卡片（展示完整的思考和工具调用）
    await sendAgentProcessingCard({
      ticketId,
      executedTools: agentResult.executedTools,
      pendingApprovals: [],
      reply: agentResult.reply,
      needsApproval: false,
    });

    logger.info(
      { ticketId, executedTools: agentResult.executedTools.length },
      "Ticket auto-processed by Agent",
    );
  } catch (err) {
    logger.error({ err, ticketId }, "Failed to process ticket");

    // 发送错误通知
    try {
      await sendStatusUpdate(
        ticketId,
        "error",
        `❌ 处理失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    } catch {
      // 忽略通知失败
    }

    throw err;
  }
}
