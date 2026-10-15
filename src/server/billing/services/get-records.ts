import { credits, creditOperation } from "@/server/billing/credits";
import type {
  GetRecordsParams,
  GetRecordsOutput,
} from "@velobase/credits/types";
export async function getRecords(
  params: GetRecordsParams,
): Promise<GetRecordsOutput> {
  return creditOperation(() => credits.getRecords(params));
}
