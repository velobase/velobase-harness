import { credits, creditOperation } from "@/modules/credits/server/service";
import type {
  GetBalanceParams,
  GetBalanceOutput,
} from "@velobase/credits/types";
export async function getBalance(
  params: GetBalanceParams,
): Promise<GetBalanceOutput> {
  return creditOperation(() => credits.getBalance(params));
}
