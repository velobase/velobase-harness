import { z } from "zod";

export const UnfreezeInputSchema = z.object({
  businessId: z.string().min(1),
});

const UnfreezeDetailSchema = z.object({
  freezeId: z.string(),
  accountId: z.string().optional(),
  wallet: z.string(),
  source: z.string(),
  amount: z.number(),
});

export const UnfreezeOutputSchema = z.object({
  totalAmount: z.number(),
  unfreezeDetails: z.array(UnfreezeDetailSchema),
  unfrozenAt: z.string(),
  isIdempotentReplay: z.boolean(),
});
