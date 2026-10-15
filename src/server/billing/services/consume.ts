import { credits, creditOperation } from "@/server/billing/credits";
import type { ConsumeParams, ConsumeOutput } from "@velobase/credits/types";
export async function consume(params: ConsumeParams): Promise<ConsumeOutput> {
  return creditOperation(() => credits.consume(params));
}
