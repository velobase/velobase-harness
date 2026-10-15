import { GUEST_MODE_CONFIG } from "@/config/guest-mode";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { env } from "@/env";
import { isFeatureEnabled } from "@/server/features/state";
import { getPublicUrl } from "@/server/storage";
import {
  acceptAgentRun,
  activeRunStatuses,
  json,
  lockExecutionTarget,
  notifyAgentRun,
} from "@/server/agents/service";
import { AgentExecutionError } from "@/server/agents/registry";
import { requireChatOwner } from "./http-auth";
import {
  loadGuestAgentConfig,
  loadUserAgentConfig,
} from "./services/agent-config.service";
import { checkGuestRateLimits } from "./services/rate-limit.service";
import type { ChatRequest, ChatRunInput } from "./input";

function validateAttachments(request: ChatRequest, userId?: string) {
  for (const part of request.message?.parts ?? []) {
    if (part.type !== "file") continue;
    if (!userId) throw new AgentExecutionError("UNAUTHORIZED");
    const prefix = new URL(
      getPublicUrl(`uploads/${userId}/`),
      env.APP_URL ?? env.NEXTAUTH_URL,
    );
    const url = new URL(part.url, env.APP_URL ?? env.NEXTAUTH_URL);
    if (
      url.origin !== prefix.origin ||
      !url.pathname.startsWith(prefix.pathname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      /%2f|%5c|%2e/i.test(url.pathname)
    )
      throw new AgentExecutionError("INVALID_ATTACHMENT");
    // SDK model messages require absolute URLs, including filesystem storage.
    part.url = url.href;
  }
}

export async function acceptChat(request: ChatRequest, httpRequest: Request) {
  const owner = await requireChatOwner(request.id);
  const requestHash = createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex");
  const requestKey = `chat:${request.id}:${owner.actorKey}:${request.requestId}`;
  const serialKey = `conversation:${request.id}`;
  // Retries of an accepted input remain observable after capability disablement.
  const existing = await db.agentRun.findUnique({ where: { requestKey } });
  if (existing) {
    if (existing.requestHash !== requestHash)
      throw new AgentExecutionError("REQUEST_CONFLICT");
    await notifyAgentRun(existing.id);
    return { runId: existing.id };
  }
  if (!(await isFeatureEnabled("ai-chat")))
    throw new AgentExecutionError("FEATURE_DISABLED");
  validateAttachments(request, owner.userId);
  const agent = owner.userId
    ? await loadUserAgentConfig(request.userAgentId ?? "", owner.userId)
    : await loadGuestAgentConfig(request.agentId ?? "");
  if (!owner.userId) {
    if (!GUEST_MODE_CONFIG.ENABLED)
      throw new AgentExecutionError("UNAUTHORIZED");
    agent.tools = [];
    await checkGuestRateLimits(httpRequest, request.id, owner.guestHash);
  }
  const billable = !!owner.userId && (await isFeatureEnabled("credits"));
  const runId = randomUUID();
  const run = await db.$transaction(async (tx) => {
    await lockExecutionTarget(tx, serialKey);
    const duplicate = await tx.agentRun.findUnique({ where: { requestKey } });
    if (duplicate) {
      if (duplicate.requestHash !== requestHash)
        throw new AgentExecutionError("REQUEST_CONFLICT");
      return duplicate;
    }
    const conversation = await tx.conversation.findUnique({
      where: { id: request.id },
    });
    if (
      !conversation ||
      (owner.userId
        ? conversation.userId !== owner.userId
        : conversation.guestOwnerHash !== owner.guestHash)
    )
      throw new AgentExecutionError("NOT_FOUND");
    if (
      !owner.userId &&
      (await tx.interaction.count({
        where: { conversationId: request.id, type: "ai_message" },
      })) >= GUEST_MODE_CONFIG.MAX_REPLIES_PER_CONVERSATION
    )
      throw new AgentExecutionError("GUEST_CONVERSATION_LIMIT_EXCEEDED");
    if (conversation.projectId) {
      const project = await tx.project.findFirst({
        where: { id: conversation.projectId, userId: owner.userId ?? "" },
      });
      if (!project) throw new AgentExecutionError("UNAUTHORIZED");
    }
    if (
      await tx.agentToolOperation.count({
        where: { status: "UNKNOWN", run: { serialKey } },
      })
    )
      throw new AgentExecutionError("TOOL_OUTCOME_UNKNOWN");
    let parentId = request.parentId ?? conversation.activeInteractionId;
    if (
      parentId &&
      !(await tx.interaction.count({
        where: { id: parentId, conversationId: request.id },
      }))
    )
      throw new AgentExecutionError("INVALID_HISTORY");
    if (request.messageId) {
      const original = await tx.interaction.findFirst({
        where: { id: request.messageId, conversationId: request.id },
      });
      const expected =
        request.trigger === "regenerate-message"
          ? "ai_message"
          : "user_message";
      if (original?.type !== expected)
        throw new AgentExecutionError("INVALID_HISTORY");
      if (
        await tx.agentRun.count({
          where: { serialKey, status: { in: [...activeRunStatuses] } },
        })
      )
        throw new AgentExecutionError("RUN_ACTIVE");
      if (request.trigger === "regenerate-message") {
        // A new branch must never silently reissue effects from the replaced reply.
        const metadata = original.metadata as { runId?: string } | null;
        const parts = original.parts as Array<{ type?: string }>;
        if (
          parts.some(
            (part) =>
              part.type?.startsWith("tool-") || part.type === "dynamic-tool",
          ) ||
          (metadata?.runId &&
            (await tx.agentToolOperation.count({
              where: { runId: metadata.runId },
            })))
        )
          throw new AgentExecutionError("REGENERATION_HAS_TOOLS");
      }
      parentId = original.parentId;
    }
    if (request.trigger === "submit-message") {
      const userMessage = await tx.interaction.create({
        data: {
          conversationId: request.id,
          userAgentId: owner.userId ? request.userAgentId : undefined,
          type: "user_message",
          parentId,
          parts: json(request.message!.parts),
        },
      });
      parentId = userMessage.id;
    }
    if (!parentId) throw new AgentExecutionError("INVALID_HISTORY");
    const assistant = await tx.interaction.create({
      data: {
        conversationId: request.id,
        userAgentId: owner.userId ? request.userAgentId : undefined,
        type: "ai_message",
        parentId,
        parts: [],
        metadata: { runId, agentId: agent.id, model: agent.model },
      },
    });
    const input: ChatRunInput = {
      version: 1,
      conversationId: request.id,
      assistantMessageId: assistant.id,
      userId: owner.userId,
      guestOwnerHash: owner.guestHash,
      userAgentId: owner.userId ? request.userAgentId : undefined,
      projectId: conversation.projectId ?? undefined,
      agent,
      billable,
    };
    const accepted = await acceptAgentRun(tx, {
      id: runId,
      executor: "chat",
      serialKey,
      actorKey: owner.actorKey,
      requestKey,
      requestHash,
      input: json(input),
    });
    const firstText = request.message?.parts.find(
      (part) => part.type === "text",
    );
    await tx.conversation.update({
      where: { id: request.id },
      data: {
        activeInteractionId: assistant.id,
        ...(!conversation.activeInteractionId &&
          firstText?.type === "text" && { title: firstText.text.slice(0, 80) }),
      },
    });
    return accepted;
  });
  await notifyAgentRun(run.id);
  return { runId: run.id };
}
