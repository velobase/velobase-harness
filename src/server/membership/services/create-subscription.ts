import { subscriptions } from "@/server/membership/subscriptions";
import type { CreateSubscriptionParams } from "../types";

/** Trusted fulfillment for accepted payment. New Admin enrollment uses subscriptions.create. */
export async function createSubscription(params: CreateSubscriptionParams) {
  return subscriptions.settleCreate(params);
}
