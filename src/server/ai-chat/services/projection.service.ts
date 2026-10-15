import { interactionPath } from "../history";
import type { Interaction } from "@prisma/client";
import type { ChatUIMessage } from "@/types/ai-chat/message";
import { InteractionType } from "@/types/ai-chat/interaction";

/**
 * Build active path from interactions (tree-aware)
 *
 * If activeInteractionId is provided, only returns messages on the path from root to that interaction.
 * Otherwise, returns all messages chronologically.
 *
 * Used for frontend display - includes original user input + file attachments + document processing status
 * Returns properly typed ChatUIMessage with metadata.createdAt
 */
export function buildUIProjection(
  interactions: Interaction[],
  activeInteractionId?: string | null,
): ChatUIMessage[] {
  // If no activeInteractionId, fall back to chronological projection (for backward compatibility)
  if (!activeInteractionId) {
    return buildChronologicalProjection(interactions);
  }

  // Build active path: from root to activeInteractionId
  return buildActivePathProjection(interactions, activeInteractionId);
}

/**
 * Active path projection: Only messages from root to activeInteractionId (tree-aware)
 * This handles regenerate/branch scenarios correctly.
 */
function buildActivePathProjection(
  interactions: Interaction[],
  activeInteractionId: string,
): ChatUIMessage[] {
  const path = interactionPath(interactions, activeInteractionId);
  const pathIds = new Set(path.map((row) => row.id));
  const messageInteractions = path.filter(
    (row) =>
      row.type === InteractionType.USER_MESSAGE ||
      row.type === InteractionType.AI_MESSAGE,
  );

  // Step 3: Get document processing interactions for messages on the path
  const docProcessings = interactions.filter(
    (i) =>
      i.type === InteractionType.DOCUMENT_PROCESSING &&
      i.correlationId &&
      pathIds.has(i.correlationId),
  );

  // Step 4: Build UI messages (maintain chronological order)
  const messages: ChatUIMessage[] = [];
  for (const interaction of messageInteractions) {
    const message = buildMessageFromInteraction(interaction, docProcessings);
    messages.push(message);
  }

  return messages;
}

/**
 * Chronological projection: All interactions in order
 * Used as fallback when no activeInteractionId is provided.
 */
function buildChronologicalProjection(
  interactions: Interaction[],
): ChatUIMessage[] {
  const messages: ChatUIMessage[] = [];

  // Only process message types
  const messageInteractions = interactions.filter(
    (i) =>
      i.type === InteractionType.USER_MESSAGE ||
      i.type === InteractionType.AI_MESSAGE,
  );

  // Get document processing interactions for lookup
  const docProcessings = interactions.filter(
    (i) => i.type === InteractionType.DOCUMENT_PROCESSING,
  );

  for (const interaction of messageInteractions) {
    const message = buildMessageFromInteraction(interaction, docProcessings);
    messages.push(message);
  }

  return messages;
}

/**
 * Build a single message from interaction with document processing attachments
 */
function buildMessageFromInteraction(
  interaction: Interaction,
  docProcessings: Interaction[],
): ChatUIMessage {
  const message: ChatUIMessage = {
    id: interaction.id,
    role:
      interaction.type === InteractionType.USER_MESSAGE ? "user" : "assistant",
    parts: [
      ...((interaction.parts as unknown[]) ?? []),
    ] as ChatUIMessage["parts"],
    metadata: {
      createdAt: interaction.createdAt,
      ...(interaction.metadata && typeof interaction.metadata === "object"
        ? (interaction.metadata as Record<string, unknown>)
        : {}),
    },
  };

  // For user messages, add related document processing status as data parts
  if (interaction.type === InteractionType.USER_MESSAGE) {
    const relatedDocs = docProcessings.filter(
      (doc) => doc.correlationId === interaction.id,
    );

    for (const docProc of relatedDocs) {
      const parts = docProc.parts as unknown[];
      const docData = (parts[0] as { data?: unknown })?.data;

      if (docData && typeof docData === "object") {
        const data = docData as {
          filename?: string;
          status?: string;
          error?: string;
        };

        // Add document processing status as data part
        message.parts.push({
          type: "data-documentProcessing",
          id: docProc.id,
          data: {
            filename: data.filename ?? "",
            status:
              (data.status as "loading" | "completed" | "failed") ??
              "completed",
            error: data.error,
          },
        });
      }
    }
  }

  return message;
}

/**
 * Build AI projection from interactions
 * Used for sending to LLM - includes enhanced content (user text + document markdown)
 */
export function buildAIProjection(
  interactions: Interaction[],
): ChatUIMessage[] {
  // AI projection: for LLM input. Enhances user text by appending processed
  // document markdown and retains only image FileParts for vision models.
  const messagesForAI: ChatUIMessage[] = [];

  // Separate message and document processing interactions
  const messageInteractions = interactions.filter(
    (i) =>
      i.type === InteractionType.USER_MESSAGE ||
      i.type === InteractionType.AI_MESSAGE,
  );
  const docProcessings = interactions.filter(
    (i) => i.type === InteractionType.DOCUMENT_PROCESSING,
  );

  for (const interaction of messageInteractions) {
    if (interaction.type === InteractionType.USER_MESSAGE) {
      // 1. Get original parts
      const parts = (interaction.parts as unknown[]) ?? [];

      // 2. Extract text content
      const textPart = parts.find(
        (p: unknown): p is { type: string; text: string } =>
          typeof p === "object" &&
          p !== null &&
          "type" in p &&
          p.type === "text",
      );
      let enhancedText = textPart?.text ?? "";

      // 3. Find related document processing
      const relatedDocs = docProcessings.filter(
        (doc) => doc.correlationId === interaction.id,
      );

      // 4. Append document Markdown to text
      for (const doc of relatedDocs) {
        const docParts = doc.parts as unknown[];
        const docPartData = (docParts[0] as { data?: unknown })?.data;

        if (docPartData && typeof docPartData === "object") {
          const data = docPartData as {
            status?: string;
            markdown?: string;
            filename?: string;
          };

          if (data.status === "completed" && data.markdown) {
            enhancedText += "\n\n---\n";
            enhancedText += `Document: ${data.filename ?? "unknown"}\n\n`;
            enhancedText += data.markdown;
            enhancedText += "\n---";
          }
        }
      }

      // 5. Keep only image FileParts (AI Vision support)
      const imageParts = parts.filter(
        (p: unknown): p is { type: string; mediaType?: string } =>
          typeof p === "object" &&
          p !== null &&
          "type" in p &&
          p.type === "file" &&
          "mediaType" in p &&
          typeof p.mediaType === "string" &&
          p.mediaType.startsWith("image/"),
      );

      // 6. Build enhanced message
      messagesForAI.push({
        id: interaction.id,
        role: "user",
        parts: [
          { type: "text", text: enhancedText },
          ...imageParts,
        ] as ChatUIMessage["parts"],
        metadata: {
          createdAt: interaction.createdAt,
        },
      });
    } else if (interaction.type === InteractionType.AI_MESSAGE) {
      // AI messages are kept as-is
      messagesForAI.push({
        id: interaction.id,
        role: "assistant",
        parts: [
          ...((interaction.parts as unknown[]) ?? []),
        ] as ChatUIMessage["parts"],
        metadata: {
          createdAt: interaction.createdAt,
          ...(interaction.metadata && typeof interaction.metadata === "object"
            ? (interaction.metadata as Record<string, unknown>)
            : {}),
        },
      });
    }
  }

  return messagesForAI;
}
