import { z } from "zod";
import { BillingBusinessTypeSchema } from "./shared";

export const PostConsumeInputSchema = z.object({
  userId: z.string().trim().min(1).max(255),
  wallet: z.string().trim().min(1).max(255).optional(),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  businessId: z.string().trim().min(1).max(255),
  businessType: BillingBusinessTypeSchema.optional(),
  referenceId: z.string().optional(),
  description: z.string().optional(),
});

export const PostConsumeDetailSchema = z.object({
  accountId: z.string().optional(),
  wallet: z.string(),
  source: z.string(),
  amount: z.number(),
});

export const PostConsumeOutputSchema = z.object({
  totalAmount: z.number(),
  consumeDetails: z.array(PostConsumeDetailSchema),
  consumedAt: z.string(),
});
