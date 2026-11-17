import type { UIMessage } from "@velobase/ai-chat/tools";

/**
 * Custom message metadata type
 */
export interface MessageMetadata {
  createdAt?: Date;
  [key: string]: unknown;
}

/**
 * Custom UIMessage with metadata and extended data parts
 * Based on Vercel AI SDK official pattern
 */
export type CustomUIMessage = UIMessage<
  MessageMetadata, // metadata type (includes createdAt)
  {
    // Document processing status data part
    documentProcessing: {
      filename: string;
      status: "loading" | "completed" | "failed";
      error?: string;
    };
  }
>;
