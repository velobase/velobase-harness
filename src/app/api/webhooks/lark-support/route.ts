/**
 * 飞书卡片回调 Webhook
 *
 * 处理客服审核卡片的 Approve/Reject 操作。
 *
 * 所有业务依赖在 POST handler 内动态 import，
 * 避免 next build 期间触发 BullMQ Queue / Redis 初始化。
 */

import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";

const logger = createLogger("lark-support-webhook");

interface CardAction {
  action: "approve" | "reject";
  ticketId: string;
}

interface LarkCardCallback {
  open_id?: string;
  user_id?: string;
  action?: {
    value?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LarkCardCallback;

    logger.info({ body }, "Received Lark card callback");

    const actionValue = body.action?.value;
    if (!actionValue) {
      return NextResponse.json({ error: "No action value" }, { status: 400 });
    }

    let cardAction: CardAction;
    try {
      cardAction = JSON.parse(actionValue) as CardAction;
    } catch {
      return NextResponse.json({ error: "Invalid action value" }, { status: 400 });
    }

    const { action, ticketId } = cardAction;

    if (!ticketId) {
      return NextResponse.json({ error: "Missing ticketId" }, { status: 400 });
    }

    const agentId = body.user_id ?? body.open_id ?? "unknown";

    if (action === "approve") {
      const { approveDraft } = await import("@/server/support/services/approve-draft");
      const { addActionEvent } = await import("@/server/support/services/add-event");
      const { supportSendQueue } = await import("@/workers/queues");
      const { generateReplyHtml } = await import("@/server/support/providers/smtp");
      const { executeTool } = await import("@/server/support/ai/tools");
      const { db } = await import("@/server/db");

      type ToolName = Parameters<typeof executeTool>[0];

      const result = await approveDraft(ticketId, agentId);

      if (!result) {
        return NextResponse.json(
          { error: "No draft found or approval failed" },
          { status: 400 }
        );
      }

      if (result.actions.length > 0) {
        const ticket = await db.supportTicket.findUnique({
          where: { id: ticketId },
        });

        if (ticket?.userId) {
          for (const act of result.actions) {
            const toolResult = await executeTool(
              act.tool as ToolName,
              ticket.userId,
              act.args
            );

            await addActionEvent(
              ticketId,
              "AGENT",
              agentId,
              act.tool,
              act.args,
              toolResult.data,
              toolResult.success,
              toolResult.error
            );

            logger.info(
              { ticketId, tool: act.tool, success: toolResult.success },
              "Executed approved action"
            );
          }
        }
      }

      await supportSendQueue.add(
        `send-${ticketId}`,
        {
          type: "send-reply",
          ticketId,
          toEmail: result.toEmail,
          subject: `Re: ${(await db.supportTicket.findUnique({ where: { id: ticketId } }))?.subject ?? "Support"}`,
          body: result.reply,
          bodyHtml: generateReplyHtml(result.reply),
          inReplyTo: result.inReplyTo,
          references: result.references,
        },
        {
          jobId: `send-${ticketId}-${Date.now()}`,
        }
      );

      logger.info({ ticketId, agentId }, "Draft approved, reply queued");

      return NextResponse.json({
        toast: {
          type: "success",
          content: "已批准，回复已入队发送",
        },
      });
    } else if (action === "reject") {
      const { rejectDraft } = await import("@/server/support/services/approve-draft");

      await rejectDraft(ticketId, agentId, "Rejected via Lark card");

      logger.info({ ticketId, agentId }, "Draft rejected");

      return NextResponse.json({
        toast: {
          type: "info",
          content: "已拒绝，请手动处理",
        },
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    logger.error({ err }, "Lark support webhook error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get("challenge");
  if (challenge) {
    return NextResponse.json({ challenge });
  }
  return NextResponse.json({ status: "ok" });
}
