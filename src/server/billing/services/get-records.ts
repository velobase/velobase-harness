import { credits, creditOperation } from "@/modules/credits/server/service";
import type {
  GetRecordsParams,
  GetRecordsOutput,
} from "@velobase/credits/types";
export async function getRecords(
  params: GetRecordsParams,
): Promise<GetRecordsOutput> {
  return creditOperation(() => credits.getRecords(params));
}
