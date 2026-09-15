import { z } from "zod";
import {
  subscriptionDraftSchema,
  cycleDraftSchema,
} from "@velobase/subscriptions";

export const CreateSubscriptionParamsSchema = subscriptionDraftSchema;
export const CreateSubscriptionCycleParamsSchema = cycleDraftSchema;
// Accepted for older callers; customer routes always derive the owner from the session.
export const GetSubscriptionStatusParamsSchema = z.object({
  userId: z.string().min(1).max(256).optional(),
});
