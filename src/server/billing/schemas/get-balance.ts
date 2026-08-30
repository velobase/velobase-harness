import { z } from "zod";

export const GetBalanceInputSchema = z.object({
  wallet: z.string().min(1).optional(),
});

const AccountSummarySchema = z.object({
  wallet: z.string(),
  source: z.string(),
  total: z.number(),
  used: z.number(),
  frozen: z.number(),
  available: z.number(),
  startsAt: z.date().nullable().optional(),
  expiresAt: z.date().nullable().optional(),
});

export const GetBalanceOutputSchema = z.object({
  totalSummary: z.object({
    total: z.number(),
    used: z.number(),
    frozen: z.number(),
    available: z.number(),
  }),
  accounts: z.array(AccountSummarySchema),
});
