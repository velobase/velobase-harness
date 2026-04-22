import { MODULES } from "@/config/modules";
import { validateChatRequest, validateTriggerRequirements } from "../validators/request.validator";
import { authenticateAndVerifyConversation } from "../services/auth.service";
import { checkGuestRateLimits } from "../services/rate-limit.service";
import { loadGuestAgentConfig, loadUserAgentConfig } from "../services/agent-config.service";
import { prepareTools, filterMessagesForAgent } from "../services/tool-preparation.service";
import { buildRegenerateHistory, buildSubmitHistory } from "../services/message-history.service";
import { processLastMessageFiles, buildEnhancedAIProjection } from "../services/ai-projection.service";
import { streamLLMResponse } from "../services/stream.service";
import { loadConversationInteractions } from "../services/interaction.service";
import { db } from "@/server/db";
import { ChatError } from "../../types/errors";
import type { ChatUIMessage } from "../../types/message";
import { createLogger } from "@/lib/logger";

const logger = createLogger("chat-route");

/**
 * POST /api/chat
 * Stream AI chat response
 */
export async function POST(req: Request) {
  if (!MODULES.features.aiChat.enabled) {
    return new Response(JSON.stringify({ error: "AI Chat is not enabled" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    // 1. Parse and validate request
    const body: unknown = await req.json();
    const request = validateChatRequest(body);
    validateTriggerRequirements(request);

    logger.info(
      {
        conversationId: request.id,
        trigger: request.trigger,
        hasMessage: !!request.message,
        messageId: request.messageId,
      },
      "Starting chat stream"
    );

    // 2. Authenticate and verify conversation access
    const authContext = await authenticateAndVerifyConversation(
      request.id,
      request.userAgentId,
      request.agentId
    );

    // 2.5. Only conversation owners can send messages
    if (!authContext.isOwner) {
      logger.warn(
        { conversationId: request.id, userId: authContext.userId },
        "Unauthorized: Only conversation owner can send messages"
      );
      return new Response(
        JSON.stringify({
          error: "UNAUTHORIZED",
          message: "Only the conversation owner can send messages",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Check guest rate limits (if guest)
    if (authContext.isGuest) {
      await checkGuestRateLimits(req, request.id, request.guestId);
    }

    // 4. Load agent configuration
    const agentConfig = authContext.isGuest
      ? await loadGuestAgentConfig(authContext.agentId!)
      : await loadUserAgentConfig(authContext.userAgentId!, authContext.userId!);

    logger.info({ agentId: agentConfig.id, agentTools: agentConfig.tools }, "Agent tools config");

    // 5. Prepare tools
    const toolContext = {
      userId: authContext.userId ?? "guest",
      conversationId: request.id,
    };
    const tools = prepareTools(agentConfig.tools, toolContext);
    
    logger.info({ toolCount: Object.keys(tools).length, toolNames: Object.keys(tools) }, "Prepared tools");

    // 6. Build message history based on trigger
    const historyResult =
      request.trigger === "regenerate-message"
        ? await buildRegenerateHistory(request.id, request.messageId!)
        : await buildSubmitHistory(
            request.id,
            request.message as ChatUIMessage,
            request.messageId,
            request.parentId,
            (await db.conversation.findUnique({ where: { id: request.id } }))?.activeInteractionId
          );

    // 7. Filter messages for current agent
    const filteredMessages = filterMessagesForAgent(
      historyResult.messages,
      tools,
      request.id
    );

    // 8. Process file attachments
    const lastMessage = filteredMessages[filteredMessages.length - 1];
    const documentProcessingResults = await processLastMessageFiles(lastMessage, request.id);

    // 9. Build AI projection with enhanced content
    const interactions = await loadConversationInteractions(request.id);
    const loadedMessageIds = new Set(historyResult.loadedMessages.map((m) => m.id));
    const messagesForAI = buildEnhancedAIProjection(
      interactions,
      loadedMessageIds,
      lastMessage,
      documentProcessingResults,
      agentConfig.id
    );

    // 10. Stream LLM response
    return await streamLLMResponse({
      conversationId: request.id,
      agentConfig,
      messagesForAI,
      filteredMessages,
      tools,
      userAgentId: authContext.userAgentId,
      trigger: request.trigger,
      parentInteractionId: historyResult.parentInteractionId,
      loadedMessages: historyResult.loadedMessages,
      documentProcessingResults,
      authContext,
    });
  } catch (err: unknown) {
    logger.error({ err }, "Chat stream error");

    // Handle ChatError with proper status codes
    if (err instanceof ChatError) {
      const error = err;
      return new Response(
        JSON.stringify({
          error: error.code,
          message: error.message,
          ...(error.retryAfter && { retryAfter: error.retryAfter }),
        }),
        {
          status: error.code === "RATE_LIMIT_EXCEEDED" ? 429 : 
                 error.code === "UNAUTHORIZED" ? 401 :
                 error.code === "NOT_FOUND" ? 404 :
                 error.code === "BAD_REQUEST" ? 400 : 500,
          headers: {
            "Content-Type": "application/json",
            ...(error.retryAfter && { "Retry-After": String(error.retryAfter) }),
          },
        }
      );
    }

    // Handle unknown errors
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({
        error: "INTERNAL_SERVER_ERROR",
        message: errorMessage,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
