import { z } from "zod";

export const ConsumeInputSchema = z.object({
  businessId: z.string().min(1),
  actualAmount: z.number().finite().nonnegative().optional(), // Optional: actual amount to consume
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
  overageAmount: z.number().optional(),
  consumeDetails: z.array(ConsumeDetailSchema),
  consumedAt: z.string(),
  isIdempotentReplay: z.boolean(),
});
