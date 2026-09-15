import { streamChat, type ToolSet } from "@velobase/ai-chat";
import { createOpenRouterChatModel } from "@velobase/ai-chat-openrouter";
import { createId } from "@paralleldrive/cuid2";
import { env } from "@/env";
import { db } from "@/server/db";
import type { AgentConfig } from "./agent-config.service";
import type { ChatUIMessage } from "../../types/message";
import type { DocumentProcessingResult } from "./ai-projection.service";
import type { AuthContext } from "./auth.service";
import {
  createUserMessageInteraction,
  createAIMessageInteraction,
  createDocumentProcessingInteraction,
  loadConversationInteractions,
} from "./interaction.service";
import {
  generateConversationTitle,
  extractTextFromMessage,
} from "./title-generation.service";
import { calculateChatCost } from "@/server/billing/config/token-pricing";
import { settleDeduction as postConsume } from "@/server/billing/services/post-consume";
import { createLogger } from "@/lib/logger";

import { isFeatureEnabled } from "@/server/features/state";

const logger = createLogger("stream-service");

export interface StreamOptions {
  conversationId: string;
  agentConfig: AgentConfig;
  messagesForAI: ChatUIMessage[];
  filteredMessages: ChatUIMessage[];
  tools: ToolSet;
  abortSignal?: AbortSignal;
  userAgentId?: string;
  trigger: "submit-message" | "regenerate-message";
  parentInteractionId: string | null;
  loadedMessages: ChatUIMessage[];
  documentProcessingResults: DocumentProcessingResult[];
  authContext: AuthContext;
}

/**
 * Stream LLM response and persist to database
 */
export async function streamLLMResponse(
  options: StreamOptions,
): Promise<Response> {
  const {
    conversationId,
    agentConfig,
    messagesForAI,
    filteredMessages,
    tools,
    userAgentId,
    trigger,
    parentInteractionId: initialParentId,
    loadedMessages,
    documentProcessingResults,
    authContext,
  } = options;

  const billThisTurn =
    !authContext.isGuest && (await isFeatureEnabled("credits"));

  // Pre-generate interaction IDs (ensures frontend always has real IDs)
  const preGeneratedIds = {
    user: trigger === "submit-message" ? createId() : null,
    assistant: createId(),
  };

  logger.info(
    { preGeneratedIds, trigger },
    "Pre-generated interaction IDs for streaming",
  );

  // Stream response with tools
  const result = streamChat({
    model: createOpenRouterChatModel({
      apiKey: env.OPENROUTER_API_KEY ?? "",
      model: agentConfig.model,
    }),
    messages: messagesForAI,
    tools,
    system: agentConfig.instructions,
    maxOutputTokens: 50000,
    maxSteps: 50,
    abortSignal: options.abortSignal,
    providerOptions: {
      ...(agentConfig.model.includes("gemini") && {
        google: {
          thinkingConfig: {
            thinkingBudget: 32000,
            includeThoughts: true,
          },
        },
      }),
      ...(/\/(o1|o3|o4)/.test(agentConfig.model) && {
        openai: {
          reasoningEffort: "high",
        },
      }),
      ...(agentConfig.model.includes("claude") && {
        anthropic: {
          thinking: { type: "enabled", budgetTokens: 12000 },
        },
      }),
    },
  });

  // Do not call result.consumeStream here because toUIMessageStreamResponse will drive the stream

  // Return streaming response
  const response = result.toUIMessageStreamResponse({
    originalMessages: filteredMessages,
    generateMessageId: () => preGeneratedIds.assistant,
    sendReasoning: true,
    onFinish: async ({ messages: finalMessages }) => {
      // Save interactions to database
      try {
        logger.info(
          {
            conversationId,
            messageCount: finalMessages.length,
            previousCount: loadedMessages.length,
          },
          "Saving conversation interactions",
        );

        const newMessages = finalMessages.slice(loadedMessages.length);
        let parentInteractionId = initialParentId;

        // Use transaction to ensure atomicity
        await db.$transaction(async (tx) => {
          // Load interactions to check if this is the first message
          const interactions =
            await loadConversationInteractions(conversationId);

          for (const msg of newMessages) {
            if (msg.role === "user") {
              // Create user_message interaction
              const userInteraction = await createUserMessageInteraction(
                conversationId,
                userAgentId!,
                msg.parts as unknown[],
                msg.metadata as Record<string, unknown> | undefined,
                {
                  interactionId: preGeneratedIds.user ?? msg.id,
                  parentId: parentInteractionId,
                  updateActiveInteraction: true,
                },
              );

              parentInteractionId = userInteraction.id;

              logger.info(
                {
                  interactionId: userInteraction.id,
                  parentId: userInteraction.parentId,
                },
                "Created user_message interaction",
              );

              // Generate title for first message (async, non-blocking)
              if (interactions.length === 0) {
                const textContent = extractTextFromMessage(msg);
                if (textContent) {
                  void generateConversationTitle(
                    conversationId,
                    textContent,
                  ).catch((error) => {
                    logger.error(
                      { error, conversationId },
                      "Failed to generate conversation title",
                    );
                  });
                }
              }

              // Create document_processing interactions
              for (const docResult of documentProcessingResults) {
                await createDocumentProcessingInteraction(
                  conversationId,
                  userAgentId!,
                  userInteraction.id,
                  docResult,
                );
              }

              if (documentProcessingResults.length > 0) {
                logger.info(
                  { count: documentProcessingResults.length },
                  "Created document_processing interactions",
                );
              }
            } else if (msg.role === "assistant") {
              // Create ai_message interaction
              const aiInteraction = await createAIMessageInteraction(
                conversationId,
                userAgentId!,
                msg.parts as unknown[],
                {
                  agentId: agentConfig.id,
                  model: agentConfig.model,
                  ...(msg.metadata as Record<string, unknown>),
                },
                {
                  interactionId: preGeneratedIds.assistant,
                  parentId: parentInteractionId,
                  updateActiveInteraction: true,
                },
              );

              parentInteractionId = aiInteraction.id;

              logger.info(
                {
                  messageId: msg.id,
                  interactionId: aiInteraction.id,
                  parentId: aiInteraction.parentId,
                },
                "Created ai_message interaction",
              );
            }
          }

          // Update conversation timestamp
          await tx.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
          });
        });

        logger.info(
          { conversationId, savedCount: newMessages.length },
          "Interactions saved successfully",
        );

        // After persistence succeeded, perform billing (server-side only)
        if (billThisTurn && authContext.userId) {
          try {
            const usage = await result.totalUsage;
            const inputTokens = usage?.inputTokens ?? 0;
            const outputTokens = usage?.outputTokens ?? 0;

            // Fallback to minimum 1 credit is handled in calculateChatCost
            await handleBilling({
              userId: authContext.userId,
              conversationId,
              assistantInteractionId: preGeneratedIds.assistant,
              model: agentConfig.model,
              totalUsage: { inputTokens, outputTokens },
            });
          } catch (billingError) {
            logger.error(
              { err: billingError, conversationId },
              "Billing failed after persistence",
            );
          }
        } else if (authContext.isGuest) {
          logger.info({ conversationId }, "Guest user - skip billing");
        }
      } catch (error) {
        logger.error(
          { err: error, conversationId },
          "Failed to save interactions",
        );
      }
    },
  });

  return response;
}

/**
 * Handle billing for chat turn (pure token-based)
 */
async function handleBilling(params: {
  userId: string;
  conversationId: string;
  assistantInteractionId: string;
  model: string;
  totalUsage: {
    inputTokens: number;
    outputTokens: number;
  };
}): Promise<void> {
  const { userId, conversationId, assistantInteractionId, model, totalUsage } =
    params;

  try {
    // Calculate cost based on token usage
    const cost = calculateChatCost(
      model,
      totalUsage.inputTokens,
      totalUsage.outputTokens,
    );

    // Execute billing
    const businessId = `chat_${conversationId}_${assistantInteractionId}`;

    // Generate user-friendly model name
    const modelName =
      model
        .split("/")
        .pop()
        ?.split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ") ?? "AI";

    await postConsume({
      userId,
      amount: cost,
      businessId,
      businessType: "TOKEN_USAGE",
      description: `AI Chat - ${modelName}`,
    });

    logger.info(
      {
        conversationId,
        cost,
        inputTokens: totalUsage.inputTokens,
        outputTokens: totalUsage.outputTokens,
        model,
      },
      "Chat turn billed successfully",
    );
  } catch (billingError) {
    logger.error(
      { err: billingError, conversationId, userId },
      "Billing failed - user may have insufficient credits",
    );
    // Note: We don't throw here to avoid disrupting the chat experience
    // The interaction is already saved, billing failure is logged
  }
}
