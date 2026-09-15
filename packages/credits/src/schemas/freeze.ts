import { z } from "zod";
import { BillingBusinessTypeSchema } from "./shared";

export const FreezeInputSchema = z.object({
  userId: z.string().min(1),
  wallet: z.string().min(1).optional(),
  businessId: z.string().min(1),
  businessType: BillingBusinessTypeSchema,
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  description: z.string().optional(),
  unfreezeAfterSeconds: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  consumeAfterSeconds: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});

const FreezeDetailSchema = z.object({
  freezeId: z.string(),
  accountId: z.string().optional(),
  wallet: z.string(),
  source: z.string(),
  amount: z.number(),
});

export const FreezeOutputSchema = z.object({
  totalAmount: z.number(),
  freezeDetails: z.array(FreezeDetailSchema),
  unfreezeAfter: z.string().nullable().optional(),
  consumeAfter: z.string().nullable().optional(),
  isIdempotentReplay: z.boolean(),
});
