import { credits, creditOperation } from "@/modules/credits/server/service";
import type { FreezeParams, FreezeOutput } from "@velobase/credits/types";
export async function freeze(params: FreezeParams): Promise<FreezeOutput> {
  return creditOperation(() => credits.freeze(params));
}
