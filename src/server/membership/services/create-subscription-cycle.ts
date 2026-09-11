import { subscriptions } from "@/modules/subscriptions/server/service";
import type { CreateSubscriptionCycleParams } from "../types";

/** Accepted paid/trial period. A stable identity survives retries and downstream delivery failures. */
export async function createSubscriptionCycle(
  params: CreateSubscriptionCycleParams,
) {
  return subscriptions.settleCycle({
    ...params,
    uniqueKey:
      params.uniqueKey ??
      (params.paymentId ? `pay_${params.paymentId}` : undefined),
  });
}
