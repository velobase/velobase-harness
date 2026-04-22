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
): Record<string, unknown> {
  registerBuiltinTools();
  const tools: Record<string, unknown> = {};

  for (const toolName of agentTools) {
    const toolFactory = toolRegistry.get(toolName);
    if (!toolFactory) {
      logger.warn({ toolName, availableTools: toolRegistry.list().map(t => t.name) }, "Tool not found in registry");
      continue;
    }
    if (toolFactory) {
      const toolInstances: unknown = toolFactory(context);

      if (
        typeof toolInstances === "object" &&
        toolInstances !== null &&
        !Array.isArray(toolInstances)
      ) {
        Object.assign(tools, toolInstances as Record<string, unknown>);
        logger.info(
          { toolName, toolKeys: Object.keys(toolInstances as Record<string, unknown>) },
          "Tools loaded"
        );
      } else {
        logger.warn({ toolName }, "Tool factory did not return a valid ToolSet object");
      }
    }
  }

  return tools;
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
    "Filtering messages for current agent"
  );

  const filteredMessages = filterUnsupportedToolCalls(messages, activeToolNames) as ChatUIMessage[];

  logger.info(
    {
      conversationId,
      originalMessageCount: messages.length,
      filteredMessageCount: filteredMessages.length,
    },
    "Message filtering completed"
  );

  return filteredMessages;
}

