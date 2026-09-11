import { z } from "zod";
import { BillingBusinessTypeSchema } from "./shared";

export const PostConsumeInputSchema = z.object({
  userId: z.string().min(1),
  wallet: z.string().min(1).optional(),
  amount: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER),
  businessId: z.string().min(1),
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
