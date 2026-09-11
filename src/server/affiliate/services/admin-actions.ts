import {
  affiliate,
  affiliateOperation,
} from "@/modules/affiliate/server/service";

export async function adminForceMatureEarning(
  earningId: string,
): Promise<void> {
  await affiliateOperation(() => affiliate.forceMature(earningId));
}
export async function adminVoidEarning(earningId: string): Promise<void> {
  await affiliateOperation(() => affiliate.voidAsAdmin(earningId));
}
export async function adminRestoreEarning(
  earningId: string,
  targetState: "AVAILABLE" | "PENDING",
): Promise<void> {
  await affiliateOperation(() =>
    affiliate.restoreAsAdmin(earningId, targetState),
  );
}
