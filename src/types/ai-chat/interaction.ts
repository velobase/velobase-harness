/**
 * Interaction types (MECE principle)
 */
export const InteractionType = {
  USER_MESSAGE: "user_message",
  AI_MESSAGE: "ai_message",
  DOCUMENT_PROCESSING: "document_processing",
} as const;

export type InteractionTypeValue =
  (typeof InteractionType)[keyof typeof InteractionType];

/**
 * Document processing data part (stored in Interaction.parts)
 */
export interface DocumentProcessingData {
  filename: string;
  sourceUrl: string;
  markdown: string;
  status: "loading" | "completed" | "failed";
  pageCount?: number;
  error?: string;
}

/**
 * Document processing part structure
 */
export interface DocumentProcessingPart {
  type: "data-documentProcessing";
  id?: string;
  data: DocumentProcessingData;
}

/**
 * Interaction database record type
 */
export interface InteractionRecord {
  id: string;
  conversationId: string;
  type: string;
  parts: unknown; // Json type from Prisma
  metadata: unknown;
  correlationId: string | null;
  createdAt: Date;
}

