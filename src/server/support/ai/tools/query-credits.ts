/**
 * 查询 Credits 余额工具（via Velobase）
 */

import { getBalance } from "@/server/billing/services/get-balance";

export interface CreditsInfo {
  available: number;
  used: number;
  frozen: number;
  total: number;
  accounts: Array<{
    type: string;
    available: number;
    expiresAt?: Date;
  }>;
}

export async function queryCredits(userId: string): Promise<CreditsInfo> {
  const balance = await getBalance({ userId });
  return {
    ...balance.totalSummary,
    accounts: balance.accounts.map((account) => ({
      type: account.source,
      available: account.available,
      expiresAt: account.expiresAt ?? undefined,
    })),
  };
}
