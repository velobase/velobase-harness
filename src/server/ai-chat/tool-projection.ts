import type { AgentToolOperation } from "@prisma/client";
import { db } from "@/server/db";
import { operationOutput } from "@/server/agents/tools";
import type { ChatUIMessage } from "@/types/ai-chat/message";

/** Tool outcomes are authoritative even if the process died before a UI checkpoint. */
export async function reconcileTools(runId: string, message: ChatUIMessage) {
  const operations = await db.agentToolOperation.findMany({
    where: { runId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return applyToolOperations(message, operations);
}

function applyToolOperations(
  message: ChatUIMessage,
  operations: AgentToolOperation[],
) {
  const parts = [...message.parts];
  for (const operation of operations) {
    const index = parts.findIndex(
      (part) =>
        "toolCallId" in part && part.toolCallId === operation.toolCallId,
    );
    const part: ChatUIMessage["parts"][number] =
      operation.status === "UNKNOWN"
        ? {
            type: "dynamic-tool",
            toolName: operation.toolName,
            toolCallId: operation.toolCallId,
            state: "output-error",
            input: operation.input,
            errorText: "TOOL_OUTCOME_UNKNOWN",
          }
        : operation.status === "SUCCEEDED" || operation.status === "WAITING"
          ? {
              type: "dynamic-tool",
              toolName: operation.toolName,
              toolCallId: operation.toolCallId,
              state: "output-available",
              input: operation.input,
              output: operationOutput(operation),
            }
          : {
              type: "dynamic-tool",
              toolName: operation.toolName,
              toolCallId: operation.toolCallId,
              state: "input-available",
              input: operation.input,
            };
    if (index < 0) parts.push(part);
    else parts[index] = part;
  }
  return { ...message, parts };
}

export async function reconcileConversationTools(
  conversationId: string,
  actorKey: string,
  messages: ChatUIMessage[],
) {
  const runIdFor = (message: ChatUIMessage) =>
    (message.metadata as { runId?: string } | undefined)?.runId;
  const runIds = messages
    .filter((message) => message.role === "assistant")
    .map(runIdFor)
    .filter((id): id is string => !!id);
  if (!runIds.length) return messages;
  const operations = await db.agentToolOperation.findMany({
    where: {
      runId: { in: runIds },
      run: { serialKey: `conversation:${conversationId}`, actorKey },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const grouped = new Map<string, AgentToolOperation[]>();
  for (const operation of operations) {
    const rows = grouped.get(operation.runId) ?? [];
    rows.push(operation);
    grouped.set(operation.runId, rows);
  }
  return messages.map((message) =>
    applyToolOperations(message, grouped.get(runIdFor(message) ?? "") ?? []),
  );
}
