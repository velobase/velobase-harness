import { env } from "@/env";

export const BILLING_RECONCILIATION_AT = {
  openId: env.LARK_BILLING_RECONCILIATION_AT_OPEN_ID ?? "",
} as const;
