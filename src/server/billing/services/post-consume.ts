import { credits, creditOperation } from "@/modules/credits/server/service";
import type {
  PostConsumeParams,
  PostConsumeOutput,
} from "@velobase/credits/types";
export async function postConsume(
  params: PostConsumeParams,
): Promise<PostConsumeOutput> {
  return creditOperation(() => credits.postConsume(params));
}
export type {
  PostConsumeParams,
  PostConsumeOutput,
  PostConsumeDetail,
} from "@velobase/credits/types";
export async function settleDeduction(
  params: PostConsumeParams,
): Promise<PostConsumeOutput> {
  return creditOperation(() => credits.settleDeduction(params));
}
