import type { UIMessage } from "ai";
import { z } from "zod";

/**
 * Message metadata schema (Zod for validation)
 */
export const messageMetadataSchema = z.object({
  createdAt: z.date(),
  agentId: z.string().optional(),
  model: z.string().optional(),
  totalTokens: z.number().optional(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

/**
 * Data parts schema (for custom data parts)
 */
export const dataPartsSchema = z.object({
  documentProcessing: z.object({
    filename: z.string(),
    status: z.enum(["loading", "completed", "failed"]),
    error: z.string().optional(),
    pageCount: z.number().optional(),
  }),
});

export type DataParts = z.infer<typeof dataPartsSchema>;

/**
 * Chat UIMessage type (extends Vercel AI SDK UIMessage)
 * No custom tools type - use default from SDK
 */
export type ChatUIMessage = UIMessage<MessageMetadata, DataParts>;

