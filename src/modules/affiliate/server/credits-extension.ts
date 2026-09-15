import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "@/server/db";
import {
  isFeatureEnabled,
  requireIncludedFeature,
} from "@/server/features/state";
import { affiliate, affiliateOperation } from "./service";

export const exchangeInput = z.object({
  requestId: z.string().uuid(),
  units: z.number().int().min(1).max(1000),
});
export async function pendingExchange(userId: string) {
  const row = await db.affiliatePayoutRequest.findFirst({
    where: {
      affiliateUserId: userId,
      type: "EXCHANGE_CREDITS",
      status: { in: ["REQUESTED", "APPROVED"] },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, amountCents: true },
  });
  return row ? { requestId: row.id, units: row.amountCents / 100 } : null;
}

/** This adapter is composed only by hosts that include credits. It is not exported by the affiliate package. */
export async function exchangeAffiliateCredits(userId: string, input: unknown) {
  const data = exchangeInput.parse(input);
  requireIncludedFeature("credits");
  const existing = await db.affiliatePayoutRequest.findFirst({
    where: {
      id: data.requestId,
      affiliateUserId: userId,
      type: "EXCHANGE_CREDITS",
    },
    select: { id: true },
  });
  if (!existing && !(await isFeatureEnabled("credits")))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Credit exchanges are disabled",
    });
  const amountCents = data.units * 100;
  const credits = data.units * 500;
  const request = await affiliateOperation(() =>
    affiliate.reservePayout({
      id: data.requestId,
      userId,
      amountCents,
      type: "EXCHANGE_CREDITS",
    }),
  );
  if (request.status === "REJECTED" || request.status === "FAILED")
    throw new TRPCError({
      code: "CONFLICT",
      message: "Exchange request is already closed",
    });
  if (request.status !== "COMPLETED") {
    // Reserve locally before the remote call. A timeout leaves the reservation in place;
    // retrying this same request uses the same provider idempotency key, even after reload.
    const { settleGrant: grant } =
      await import("@/server/billing/services/grant");
    await grant({
      userId,
      source: "default",
      amount: credits,
      outerBizId: `affiliate_exchange_${request.id}`,
      businessType: "ADMIN_GRANT",
      referenceId: request.id,
      description: `Affiliate exchange: ${amountCents} USD cents for ${credits} credits`,
    });
    await affiliateOperation(() => affiliate.completeExchange(request.id));
  }
  return {
    ok: true,
    creditsGranted: credits,
    amountCents,
    payoutRequestId: request.id,
  };
}
