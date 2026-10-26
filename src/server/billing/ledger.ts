import { createVelobaseLedger } from "@velobase/credits-velobase";
import { env } from "@/env";
import { createLogger } from "@/lib/logger";
import { getBillingPool } from "./database";

const logger = createLogger("billing-ledger");
let ledger: ReturnType<typeof createVelobaseLedger> | undefined;

export function getCreditLedger() {
  return (ledger ??= createVelobaseLedger({
    pool: getBillingPool(),
    tenantId: env.BILLING_TENANT_ID,
    projectId: env.BILLING_PROJECT_ID,
    onError: (err, context) =>
      logger.error({ ...context, err }, "Ledger operation failed"),
  }));
}
