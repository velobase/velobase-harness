import { reconcileConversationTools } from "@/server/ai-chat/tool-projection";
import { chatRunInputSchema } from "@/server/ai-chat/input";
import { activeRunStatuses } from "@/server/agents/service";
import { z } from "zod";
import { db } from "@/server/db";
import { requireChatOwner } from "@/server/ai-chat/http-auth";
import { chatErrorResponse, requireSameOrigin } from "@/server/ai-chat/http";
import { cancelAgentRun } from "@/server/agents/service";
import { buildUIProjection } from "@/server/ai-chat/services/projection.service";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const owner = await requireChatOwner(id);
    const where = { serialKey: `conversation:${id}`, actorKey: owner.actorKey };
    const select = {
      id: true,
      status: true,
      errorCode: true,
      updatedAt: true,
      usageUncertain: true,
      input: true,
    } as const;
    const active = await db.agentRun.findFirst({
      where: { ...where, status: { in: [...activeRunStatuses] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select,
    });
    const latest =
      active ??
      (await db.agentRun.findFirst({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select,
      }));
    const run = latest
      ? {
          id: latest.id,
          status: latest.status,
          errorCode: latest.errorCode,
          updatedAt: latest.updatedAt,
          usageUncertain: latest.usageUncertain,
          assistantMessageId: chatRunInputSchema.parse(latest.input)
            .assistantMessageId,
        }
      : null;
    const interactions = await db.interaction.findMany({
      where: { conversationId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1000,
    });
    let messages = buildUIProjection(
      interactions.reverse(),
      owner.conversation.activeInteractionId,
    );
    // Only owned operations can contribute late receipts to this projection.
    messages = await reconcileConversationTools(id, owner.actorKey, messages);
    return Response.json(
      { run, messages },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return chatErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    const owner = await requireChatOwner(id);
    const { runId } = z
      .object({ runId: z.string().min(1).max(128) })
      .parse(await request.json());
    const run = await db.agentRun.findFirst({
      where: {
        id: runId,
        serialKey: `conversation:${id}`,
        actorKey: owner.actorKey,
      },
    });
    if (!run) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    return Response.json(await cancelAgentRun(run.id, owner.actorKey));
  } catch (error) {
    return chatErrorResponse(error);
  }
}
