import { credits, creditOperation } from "@/modules/credits/server/service";
import type { UnfreezeParams, UnfreezeOutput } from "@velobase/credits/types";
export async function unfreeze(
  params: UnfreezeParams,
): Promise<UnfreezeOutput> {
  return creditOperation(() => credits.unfreeze(params));
}
