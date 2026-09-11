import { z } from "zod";

export const aiSupportFeature = {
  id: "ai-support",
  category: "business",
  dependencies: ["email-management"],
  defaultEnabled: false,
} as const;

export const supportInputSchema = z.object({
  subject: z.string().max(1000),
  messages: z
    .array(
      z.object({
        actor: z.enum(["customer", "agent"]),
        body: z.string().max(4000),
      }),
    )
    .min(1)
    .max(20),
});
export const supportSuggestionSchema = z.object({
  category: z.enum(["BILLING", "BUG", "HOWTO", "OTHER"]),
  summary: z.string().trim().min(1).max(2000),
  reply: z.string().trim().min(1).max(10000),
  reviewNotes: z.string().max(2000),
});
export type SupportInput = z.infer<typeof supportInputSchema>;
export type SupportSuggestion = z.infer<typeof supportSuggestionSchema>;
export interface SupportModel {
  suggest(input: SupportInput): Promise<unknown>;
}
export function createSupportAssistant(options: {
  requireEnabled(): Promise<void>;
  model(): Promise<SupportModel> | SupportModel;
}) {
  return {
    async suggest(input: unknown): Promise<SupportSuggestion> {
      const data = supportInputSchema.parse(input);
      await options.requireEnabled();
      const model = await options.model();
      return supportSuggestionSchema.parse(await model.suggest(data));
    },
  };
}
