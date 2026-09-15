import { z } from "zod";
import { BillingBusinessTypeSchema, BillingSourceSchema } from "./shared";

export const GrantInputSchema = z.object({
  userId: z.string().min(1),
  wallet: z.string().min(1).optional(),
  source: BillingSourceSchema.optional(),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  outerBizId: z.string().min(1),
  businessType: BillingBusinessTypeSchema.optional(),
  referenceId: z.string().optional(),
  description: z.string().optional(),
  startsAt: z.date().nullable().optional(),
  expiresAt: z.date().nullable().optional(),
});

export const GrantOutputSchema = z.object({
  accountId: z.string(),
  wallet: z.string(),
  source: z.string(),
  totalAmount: z.number(),
  addedAmount: z.number(),
  recordId: z.string(),
  isIdempotentReplay: z.boolean(),
});
