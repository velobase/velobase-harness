import { credits, creditOperation } from "@/server/billing/credits";
import type {
  GetBalanceParams,
  GetBalanceOutput,
} from "@velobase/credits/types";
export async function getBalance(
  params: GetBalanceParams,
): Promise<GetBalanceOutput> {
  return creditOperation(() => credits.getBalance(params));
}
