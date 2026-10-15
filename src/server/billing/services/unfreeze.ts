import { credits, creditOperation } from "@/server/billing/credits";
import type { UnfreezeParams, UnfreezeOutput } from "@velobase/credits/types";
export async function unfreeze(
  params: UnfreezeParams,
): Promise<UnfreezeOutput> {
  return creditOperation(() => credits.unfreeze(params));
}
