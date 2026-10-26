import { createCredits, CreditsError } from "@velobase/credits";
import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { getCreditLedger } from "./ledger";
import { createLogger } from "@/lib/logger";
import { isFeatureEnabled } from "@/server/features/state";

const logger = createLogger("billing");
export const credits = createCredits({
  isEnabled: () => isFeatureEnabled("credits"),
  ledger: getCreditLedger,
});
export async function creditOperation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    logger.error({ err: error }, "Credit operation failed");
    if (error instanceof CreditsError)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: error.message,
        cause: error,
      });
    if (error instanceof ZodError)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error.message,
        cause: error,
      });
    throw error;
  }
}
