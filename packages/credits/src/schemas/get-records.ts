import { z } from "zod";

export const GetRecordsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  operationType: z.string().optional(),
  transactionId: z.string().optional(),
});

const RecordSummarySchema = z.object({
  id: z.string(),
  operationType: z.string(),
  amount: z.number(),
  wallet: z.string(),
  source: z.string(),
  transactionId: z.string().nullable().optional(),
  businessType: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  accountId: z.string(),
  status: z.string(),
  createdAt: z.date(),
});

export const GetRecordsOutputSchema = z.object({
  records: z.array(RecordSummarySchema),
  total: z.number(),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});
