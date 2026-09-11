import { env } from "@/env";
import { createLogger } from "@/lib/logger";
import { db } from "@/server/db";
import { createOpenRouterChatModel } from "@velobase/ai-chat-openrouter";
import { generateText } from "ai";

const logger = createLogger("title-generation");

/**
 * Generate a conversation title using OpenRouter (GPT-4o-mini)
 * Falls back to truncated user message if generation fails
 */
export async function generateConversationTitle(
  conversationId: string,
  userMessage: string,
): Promise<string> {
  try {
    // Fallback if OpenRouter is not configured
    if (!env.OPENROUTER_API_KEY) {
      logger.warn("OPENROUTER_API_KEY not configured, using fallback title");
      return userMessage.slice(0, 30);
    }

    // Generate title using AI SDK
    const { text } = await generateText({
      model: createOpenRouterChatModel({
        apiKey: env.OPENROUTER_API_KEY,
        model: "openai/gpt-4o-mini",
      }),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(30_000),
      messages: [
        {
          role: "system",
          content:
            "你是一个会话标题生成助手。基于用户的问题，生成一个简短的标题（5-10个字）。直接输出标题文本，不要引号，不要其他解释。",
        },
        {
          role: "user",
          content: `用户问题：${userMessage.slice(0, 500)}\n\n生成标题：`,
        },
      ],
      temperature: 0.7,
    });

    const generatedTitle = text.trim();

    if (!generatedTitle) {
      logger.warn("No title generated, using fallback");
      return userMessage.slice(0, 30);
    }

    // Clean up title (remove quotes if present)
    const cleanTitle = generatedTitle.replace(/^["']|["']$/g, "");

    // Update conversation title in database
    await db.conversation.update({
      where: { id: conversationId },
      data: { title: cleanTitle },
    });

    logger.info(
      { conversationId, title: cleanTitle },
      "Generated conversation title",
    );

    return cleanTitle;
  } catch (error) {
    logger.error({ error, conversationId }, "Failed to generate title");
    // Return fallback title
    return userMessage.slice(0, 30);
  }
}

/**
 * Extract text content from a user message
 */
export function extractTextFromMessage(message: {
  parts: Array<{ type: string; text?: string }>;
}): string {
  const textParts = message.parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => (part as { text: string }).text);

  return textParts.join(" ").trim();
}
