import {
  createCredits,
  CreditsError,
  type CreditLedger,
} from "@velobase/credits";
import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { env } from "@/env";
import { isFeatureEnabled } from "@/server/features/state";

let ledger: CreditLedger | undefined;
export const credits = createCredits({
  isEnabled: () => isFeatureEnabled("credits"),
  async ledger() {
    if (ledger) return ledger;
    if (!env.VELOBASE_API_KEY)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Configure the credit ledger",
      });
    const { createVelobaseLedger } = await import("@velobase/credits-velobase");
    return (ledger = createVelobaseLedger(env.VELOBASE_API_KEY));
  },
});
export async function creditOperation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
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
