import { z } from "zod";

const id = z.string().min(1).max(128);
export const chatRequestSchema = z
  .object({
    id,
    requestId: id,
    trigger: z
      .enum(["submit-message", "regenerate-message"])
      .default("submit-message"),
    userAgentId: id.optional(),
    agentId: id.optional(),
    messageId: id.optional(),
    parentId: id.optional(),
    message: z
      .object({
        parts: z
          .array(
            z.discriminatedUnion("type", [
              z.object({
                type: z.literal("text"),
                text: z.string().max(32_000),
              }),
              z.object({
                type: z.literal("file"),
                url: z.string().max(4096),
                filename: z.string().max(255).optional(),
                mediaType: z.enum([
                  "image/png",
                  "image/jpeg",
                  "image/webp",
                  "image/gif",
                ]),
              }),
            ]),
          )
          .min(1)
          .max(20),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.trigger === "submit-message" && !value.message)
      ctx.addIssue({ code: "custom", message: "Message required" });
    if (value.trigger === "regenerate-message" && !value.messageId)
      ctx.addIssue({ code: "custom", message: "Message ID required" });
  });
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatRunInputSchema = z.object({
  version: z.literal(1),
  conversationId: id,
  assistantMessageId: id,
  userId: id.optional(),
  guestOwnerHash: z.string().optional(),
  userAgentId: id.optional(),
  projectId: id.optional(),
  billable: z.boolean(),
  agent: z.object({
    id,
    name: z.string(),
    instructions: z.string(),
    model: z.string(),
    tools: z.array(z.string()),
    enabled: z.boolean(),
  }),
});
export type ChatRunInput = z.infer<typeof chatRunInputSchema>;
