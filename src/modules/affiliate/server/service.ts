import {
  AffiliateError,
  createAffiliate,
  type AffiliateRepository,
  type AffiliateTransaction,
  type Earning,
  type Payout,
} from "@velobase/affiliate";
import type { AffiliateEarning, AffiliatePayoutRequest } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { db } from "@/server/db";
import { isFeatureEnabled } from "@/server/features/state";

function earning(row: AffiliateEarning): Earning {
  return {
    ...row,
    context: {
      orderId: row.orderId,
      paymentId: row.paymentId,
      subscriptionId: row.subscriptionId,
      paymentGateway: row.paymentGateway,
    },
  };
}
function payout(row: AffiliatePayoutRequest): Payout {
  return { ...row, userId: row.affiliateUserId };
}

const repository: AffiliateRepository = {
  async withAccount(userId, work) {
    return db.$transaction(
      async (tx) => {
        const owner = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        if (!owner.length)
          throw new AffiliateError("NOT_FOUND", "Account owner not found");
        await tx.affiliateAccount.upsert({
          where: { userId },
          create: { userId },
          update: {},
        });
        const account = () =>
          tx.affiliateAccount.findUniqueOrThrow({ where: { userId } });
        const operations: AffiliateTransaction = {
          account,
          async findEarning(source) {
            const row = await tx.affiliateEarning.findFirst({
              where: {
                affiliateUserId: userId,
                sourceType: source.sourceType,
                sourceExternalId: source.sourceExternalId,
                sourceSequence: source.sourceSequence,
              },
            });
            return row ? earning(row) : null;
          },
          async getEarning(id) {
            const row = await tx.affiliateEarning.findFirst({
              where: { id, affiliateUserId: userId },
            });
            return row ? earning(row) : null;
          },
          async dueEarnings(now, limit) {
            return (
              await tx.affiliateEarning.findMany({
                where: {
                  affiliateUserId: userId,
                  state: "PENDING",
                  availableAt: { lte: now },
                },
                orderBy: [{ availableAt: "asc" }, { id: "asc" }],
                take: limit,
              })
            ).map(earning);
          },
          async createEarning({ context, ...data }) {
            return earning(
              await tx.affiliateEarning.create({
                data: {
                  ...data,
                  affiliateUserId: userId,
                  orderId: context.orderId,
                  paymentId: context.paymentId,
                  subscriptionId: context.subscriptionId,
                  paymentGateway: context.paymentGateway,
                },
              }),
            );
          },
          async setEarningState(id, state) {
            const updated = await tx.affiliateEarning.updateMany({
              where: { id, affiliateUserId: userId },
              data: { state },
            });
            if (updated.count !== 1)
              throw new AffiliateError("NOT_FOUND", "Earning not found");
          },
          async getPayout(id) {
            const row = await tx.affiliatePayoutRequest.findFirst({
              where: { id, affiliateUserId: userId },
            });
            return row ? payout(row) : null;
          },
          async activePayout(type) {
            const row = await tx.affiliatePayoutRequest.findFirst({
              where: {
                affiliateUserId: userId,
                type,
                status: { in: ["REQUESTED", "APPROVED"] },
              },
            });
            return row ? payout(row) : null;
          },
          async createPayout({ userId: _owner, ...data }) {
            const row = await tx.affiliatePayoutRequest.create({
              data: { ...data, affiliateUserId: userId },
            });
            if (data.type === "CASHOUT_USDT" && data.walletAddress)
              await tx.user.update({
                where: { id: userId },
                data: { payoutWallet: data.walletAddress },
              });
            return payout(row);
          },
          async setPayout(id, change) {
            const updated = await tx.affiliatePayoutRequest.updateMany({
              where: { id, affiliateUserId: userId },
              data: change,
            });
            if (updated.count !== 1)
              throw new AffiliateError("NOT_FOUND", "Payout not found");
          },
          async applyLedger(entry, next) {
            const current = await account();
            // All writers hold the same owner lock. A duplicate here is a broken transaction
            // contract: roll back, rather than catching a Postgres uniqueness error and continuing.
            await tx.affiliateLedgerEntry.create({
              data: { ...entry, userId, accountId: current.id },
            });
            await tx.affiliateAccount.update({
              where: { userId },
              data: { ...next, version: { increment: 1 } },
            });
          },
        };
        return work(operations);
      },
      { timeout: 30_000 },
    );
  },
  async earningOwner(id) {
    return (
      (
        await db.affiliateEarning.findUnique({
          where: { id },
          select: { affiliateUserId: true },
        })
      )?.affiliateUserId ?? null
    );
  },
  async sourceOwner(source) {
    return (
      (
        await db.affiliateEarning.findUnique({
          where: { sourceType_sourceExternalId_sourceSequence: source },
          select: { affiliateUserId: true },
        })
      )?.affiliateUserId ?? null
    );
  },
  async payoutOwner(id) {
    return (
      (
        await db.affiliatePayoutRequest.findUnique({
          where: { id },
          select: { affiliateUserId: true },
        })
      )?.affiliateUserId ?? null
    );
  },
};

export const affiliate = createAffiliate({
  repository,
  isEnabled: () => isFeatureEnabled("affiliate"),
});
export async function affiliateOperation<T>(
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AffiliateError)
      throw new TRPCError({
        code: error.code === "UNAVAILABLE" ? "FORBIDDEN" : error.code,
        message: error.message,
        cause: error,
      });
    throw error;
  }
}
