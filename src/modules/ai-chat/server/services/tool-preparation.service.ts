import type { ToolSet } from "@velobase/ai-chat";
import { toolRegistry, registerBuiltinTools } from "@/server/api/tools";
import { filterUnsupportedToolCalls } from "../lib/message-utils";
import type { ChatUIMessage } from "../../types/message";
import type { ToolContext } from "../../types/tool";
import { createLogger } from "@/lib/logger";

const logger = createLogger("tool-preparation-service");

/**
 * Prepare tools for agent
 */
export function prepareTools(
  agentTools: string[],
  context: ToolContext,
): ToolSet {
  registerBuiltinTools();
  return toolRegistry.prepare(agentTools, context);
}

/**
 * Filter messages to remove unsupported tool calls
 */
export function filterMessagesForAgent(
  messages: ChatUIMessage[],
  tools: Record<string, unknown>,
  conversationId: string,
): ChatUIMessage[] {
  const activeToolNames = Object.keys(tools);

  logger.info(
    { conversationId, activeTools: activeToolNames },
    "Filtering messages for current agent",
  );

  const filteredMessages = filterUnsupportedToolCalls(
    messages,
    activeToolNames,
  );

  logger.info(
    {
      conversationId,
      originalMessageCount: messages.length,
      filteredMessageCount: filteredMessages.length,
    },
    "Message filtering completed",
  );

  return filteredMessages;
}
