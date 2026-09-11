import { credits, creditOperation } from "@/modules/credits/server/service";
import type { ConsumeParams, ConsumeOutput } from "@velobase/credits/types";
export async function consume(params: ConsumeParams): Promise<ConsumeOutput> {
  return creditOperation(() => credits.consume(params));
}
