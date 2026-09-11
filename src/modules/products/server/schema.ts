import { z } from "zod";
import { catalogUpdateSchema } from "@velobase/products";

const integer = z.number().int().min(0).max(2_147_483_647);
export const updateHostProductSchema = catalogUpdateSchema.extend({
  productId: z.string().min(1).max(256),
  revision: z.string().datetime().optional(),
  currency: z.literal("USD").optional(),
  hasTrial: z.boolean().optional(),
  trialDays: integer.optional(),
  trialCreditsAmount: integer.optional(),
  creditsPerMonth: integer.optional(),
  creditsAmount: integer.min(1).optional(),
});
