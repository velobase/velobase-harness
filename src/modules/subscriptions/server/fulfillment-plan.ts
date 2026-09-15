import { z } from "zod";
import type { DeliveryEffect } from "@velobase/subscriptions/delivery";

export const subscriptionProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  hasTrial: z.boolean().default(false),
  trialDays: z.number().int().nonnegative().nullable().optional(),
  trialCreditsAmount: z.number().int().nonnegative().nullable().optional(),
  metadata: z
    .object({ useCase: z.string().optional() })
    .passthrough()
    .nullable()
    .optional()
    .catch(undefined),
  productSubscription: z.object({
    planId: z.string().min(1),
    plan: z.object({
      interval: z
        .string()
        .transform((value) => value.toUpperCase())
        .pipe(z.enum(["WEEK", "MONTH", "YEAR"])),
      intervalCount: z.number().int().positive().default(1),
      creditsPerPeriod: z.number().int().nonnegative().optional(),
      creditsPerMonth: z.number().int().nonnegative().optional(),
    }),
  }),
});

/** Preserve the complete example's existing calendar arithmetic. */
export function addMonths(date: Date, count: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + count);
  return next;
}
export function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}
export function periodEnd(
  start: Date,
  interval: "WEEK" | "MONTH" | "YEAR",
  count: number,
) {
  const next = new Date(start);
  if (interval === "WEEK") next.setDate(next.getDate() + count * 7);
  else if (interval === "MONTH") next.setMonth(next.getMonth() + count);
  else next.setFullYear(next.getFullYear() + count);
  return next;
}
export function creditEffect(input: {
  userId: string;
  key: string;
  amount: number;
  referenceId: string;
  startsAt: Date;
  expiresAt: Date;
  trial?: boolean;
  description: string;
}): DeliveryEffect {
  return {
    key: input.key,
    kind: "credits.grant",
    payload: {
      userId: input.userId,
      outerBizId: input.key,
      amount: input.amount,
      source: input.trial ? "free_trial" : "membership",
      businessType: input.trial ? "FREE_TRIAL" : "SUBSCRIPTION",
      referenceId: input.referenceId,
      description: input.description,
      startsAt: input.startsAt.toISOString(),
      expiresAt: input.expiresAt.toISOString(),
    },
  };
}
export const savedPeriodContextSchema = z.object({
  kind: z.enum(["initial", "renewal"]),
  startsAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  cycleNumber: z.number().int().positive(),
  trial: z.boolean(),
  manualExtension: z.boolean().default(false),
  trialSource: z.string().optional(),
  hasCredits: z.boolean(),
});
