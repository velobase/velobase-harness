import { credits, creditOperation } from "@/modules/credits/server/service";
import type { GrantParams, GrantOutput } from "@velobase/credits/types";
export async function grant(params: GrantParams): Promise<GrantOutput> {
  return creditOperation(() => credits.grant(params));
}
/** Settle a paid order, existing subscription or reserved exchange; never expose as a user mutation. */
export async function settleGrant(params: GrantParams): Promise<GrantOutput> {
  return creditOperation(() => credits.settleGrant(params));
}
