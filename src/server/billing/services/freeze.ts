import { credits, creditOperation } from "@/server/billing/credits";
import type { FreezeParams, FreezeOutput } from "@velobase/credits/types";
export async function freeze(params: FreezeParams): Promise<FreezeOutput> {
  return creditOperation(() => credits.freeze(params));
}
