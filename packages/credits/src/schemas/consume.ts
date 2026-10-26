import { z } from "zod";

export const ConsumeInputSchema = z.object({
  businessId: z.string().trim().min(1).max(255),
  actualAmount: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(), // Optional: actual amount to consume
});

export const ConsumeDetailSchema = z.object({
  freezeId: z.string(),
  accountId: z.string().optional(),
  wallet: z.string(),
  source: z.string(),
  amount: z.number(),
});

export const ConsumeOutputSchema = z.object({
  totalAmount: z.number(),
  returnedAmount: z.number().optional(), // Amount returned if actualAmount < frozen
  consumeDetails: z.array(ConsumeDetailSchema),
  consumedAt: z.string(),
  isIdempotentReplay: z.boolean(),
});
