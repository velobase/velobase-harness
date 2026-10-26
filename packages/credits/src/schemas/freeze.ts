import { z } from "zod";
import { BillingBusinessTypeSchema } from "./shared";

export const FreezeInputSchema = z
  .object({
    userId: z.string().trim().min(1).max(255),
    wallet: z.string().trim().min(1).max(255).optional(),
    businessId: z.string().trim().min(1).max(255),
    businessType: BillingBusinessTypeSchema,
    amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    description: z.string().optional(),
    unfreezeAfterSeconds: z
      .number()
      .int()
      .positive()
      .max(30 * 24 * 60 * 60)
      .optional(),
    consumeAfterSeconds: z
      .number()
      .int()
      .positive()
      .max(30 * 24 * 60 * 60)
      .optional(),
  })
  .refine(
    (input) =>
      input.unfreezeAfterSeconds === undefined ||
      input.consumeAfterSeconds === undefined,
    {
      message: "Choose either automatic release or automatic settlement",
      path: ["consumeAfterSeconds"],
    },
  );

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
