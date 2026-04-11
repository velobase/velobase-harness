import { TRPCError } from "@trpc/server";
import type {
  AffiliateEarningSourceType,
  AffiliateEarningState,
  AffiliateLedgerKind,
  AffiliateLedgerReferenceType,
  Prisma,
} from "@prisma/client";

import { db } from "@/server/db";
import { grant } from "@/server/billing/services/grant";

const COMMISSION_RATE_BPS = 3000; // 30%

function computeCommissionCents(grossAmountCents: number): number {
  return Math.floor((grossAmountCents * COMMISSION_RATE_BPS) / 10_000);
}

function allocateAvailableCreditAgainstDebt(params: {
  availableCreditCents: number;
  currentDebtCents: number;
}): { repayDebtCents: number; toAvailableCents: number } {
  const credit = Math.max(0, params.availableCreditCents);
  const debt = Math.max(0, params.currentDebtCents);
  const repay = Math.min(credit, debt);
  return { repayDebtCents: repay, toAvailableCents: credit - repay };
}

function computeEarningState(params: {
  paymentGateway: string | null | undefined;
  now?: Date;
}): { state: AffiliateEarningState; availableAt: Date } {
  const now = params.now ?? new Date();
  const gw = (params.paymentGateway ?? "").toString().toUpperCase();
  if (gw === "NOWPAYMENTS") {
    return { state: "AVAILABLE", availableAt: now };
  }
  // Default: treat everything else as card-like risk, 30d cooldown
  return { state: "PENDING", availableAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) };
}

type Tx = Prisma.TransactionClient;

async function lockUserRow(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
}

async function getOrCreateAccount(tx: Tx, userId: string) {
  return tx.affiliateAccount.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: {
      id: true,
      userId: true,
      pendingCents: true,
      availableCents: true,
      lockedCents: true,
      debtCents: true,
      version: true,
    },
  });
}

async function createLedgerEntryAndApply(tx: Tx, params: {
  userId: string;
  accountId: string;
  kind: AffiliateLedgerKind;
  referenceType: AffiliateLedgerReferenceType;
  referenceId?: string | null;
  idempotencyKey: string;
  deltaPendingCents?: number;
  deltaAvailableCents?: number;
  deltaLockedCents?: number;
  deltaDebtCents?: number;
  meta?: Prisma.InputJsonValue;
}) {
  const deltaPending = params.deltaPendingCents ?? 0;
  const deltaAvailable = params.deltaAvailableCents ?? 0;
  const deltaLocked = params.deltaLockedCents ?? 0;
  const deltaDebt = params.deltaDebtCents ?? 0;

  // Try insert the ledger entry first. If it's a duplicate (idempotency), do nothing.
  try {
    await tx.affiliateLedgerEntry.create({
      data: {
        accountId: params.accountId,
        userId: params.userId,
        kind: params.kind,
        referenceType: params.referenceType,
        referenceId: params.referenceId ?? null,
        idempotencyKey: params.idempotencyKey,
        deltaPendingCents: deltaPending,
        deltaAvailableCents: deltaAvailable,
        deltaLockedCents: deltaLocked,
        deltaDebtCents: deltaDebt,
        meta: params.meta ?? undefined,
      },
      select: { id: true },
    });
  } catch (err: unknown) {
    // Prisma unique violation code
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") return;
    throw err;
  }

  const account = await tx.affiliateAccount.findUnique({
    where: { id: params.accountId },
    select: {
      id: true,
      pendingCents: true,
      availableCents: true,
      lockedCents: true,
      debtCents: true,
      version: true,
    },
  });
  if (!account) throw new Error("Affiliate account not found");

  const nextPending = account.pendingCents + deltaPending;
  const nextAvailable = account.availableCents + deltaAvailable;
  const nextLocked = account.lockedCents + deltaLocked;
  const nextDebt = account.debtCents + deltaDebt;

  if (nextPending < 0 || nextAvailable < 0 || nextLocked < 0 || nextDebt < 0) {
    throw new TRPCError({ code: "CONFLICT", message: "Affiliate balance would go negative" });
  }

  await tx.affiliateAccount.update({
    where: { id: params.accountId },
    data: {
      pendingCents: nextPending,
      availableCents: nextAvailable,
      lockedCents: nextLocked,
      debtCents: nextDebt,
      version: { increment: 1 },
    },
    select: { id: true },
  });
}

export async function matureAffiliateEarningsForUser(userId: string): Promise<number> {
  return db.$transaction(async (tx) => {
    await lockUserRow(tx, userId);
    return matureAffiliateEarningsForUserTx(tx, userId);
  });
}

async function matureAffiliateEarningsForUserTx(tx: Tx, userId: string): Promise<number> {
  const now = new Date();
  const account = await getOrCreateAccount(tx, userId);
  let remainingDebtCents = account.debtCents;

  const candidates = await tx.affiliateEarning.findMany({
    where: { affiliateUserId: userId, state: "PENDING", availableAt: { lte: now } },
    select: { id: true, commissionCents: true },
    orderBy: { availableAt: "asc" },
    take: 500, // safety bound
  });

  let matured = 0;
  for (const e of candidates) {
    const updated = await tx.affiliateEarning.updateMany({
      where: { id: e.id, state: "PENDING" },
      data: { state: "AVAILABLE" },
    });
    if (updated.count !== 1) continue;

    const { repayDebtCents, toAvailableCents } = allocateAvailableCreditAgainstDebt({
      availableCreditCents: e.commissionCents,
      currentDebtCents: remainingDebtCents,
    });
    remainingDebtCents -= repayDebtCents;

    await createLedgerEntryAndApply(tx, {
      userId,
      accountId: account.id,
      kind: "EARNING_MATURED",
      referenceType: "EARNING",
      referenceId: e.id,
      idempotencyKey: `earning_matured:${e.id}`,
      deltaPendingCents: -e.commissionCents,
      deltaAvailableCents: +toAvailableCents,
      deltaDebtCents: repayDebtCents > 0 ? -repayDebtCents : 0,
    });
    matured += 1;
  }

  return matured;
}

export async function getAffiliateAccountBalances(userId: string) {
  await matureAffiliateEarningsForUser(userId);
  const account = await db.affiliateAccount.findUnique({
    where: { userId },
    select: {
      pendingCents: true,
      availableCents: true,
      lockedCents: true,
      debtCents: true,
    },
  });
  return (
    account ?? { pendingCents: 0, availableCents: 0, lockedCents: 0, debtCents: 0 }
  );
}

export async function createAffiliateEarningForOrderPayment(paymentId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, paymentGateway: true, orderId: true },
    });
    if (!payment?.orderId) return;

    const order = await tx.order.findUnique({
      where: { id: payment.orderId },
      select: {
        id: true,
        amount: true,
        user: { select: { id: true, referredById: true } },
      },
    });
    if (!order?.user?.referredById) return;
    const affiliateUserId = order.user.referredById;
    if (affiliateUserId === order.user.id) return;

    const grossAmountCents = order.amount;
    const commissionCents = computeCommissionCents(grossAmountCents);
    if (commissionCents <= 0) return;

    const { state, availableAt } = computeEarningState({ paymentGateway: payment.paymentGateway });

    await lockUserRow(tx, affiliateUserId);
    const account = await getOrCreateAccount(tx, affiliateUserId);

    const earning = await tx.affiliateEarning.upsert({
      where: {
        sourceType_sourceExternalId_sourceSequence: {
          sourceType: "ORDER_PAYMENT",
          sourceExternalId: payment.id,
          sourceSequence: 0,
        },
      },
      create: {
        sourceType: "ORDER_PAYMENT",
        sourceExternalId: payment.id,
        sourceSequence: 0,
        affiliateUserId,
        referredUserId: order.user.id,
        orderId: order.id,
        paymentId: payment.id,
        paymentGateway: payment.paymentGateway,
        grossAmountCents,
        commissionRateBps: COMMISSION_RATE_BPS,
        commissionCents,
        state,
        availableAt,
      },
      update: {
        // Keep only non-money fields fresh.
        paymentGateway: payment.paymentGateway,
        availableAt,
      },
      select: { id: true, commissionCents: true, state: true },
    });

    const isAvailable = earning.state === "AVAILABLE";
    const { repayDebtCents, toAvailableCents } = isAvailable
      ? allocateAvailableCreditAgainstDebt({
          availableCreditCents: earning.commissionCents,
          currentDebtCents: account.debtCents,
        })
      : { repayDebtCents: 0, toAvailableCents: 0 };

    await createLedgerEntryAndApply(tx, {
      userId: affiliateUserId,
      accountId: account.id,
      kind: "EARNING_CREATED",
      referenceType: "EARNING",
      referenceId: earning.id,
      idempotencyKey: `earning_created:${earning.id}`,
      deltaPendingCents: earning.state === "PENDING" ? earning.commissionCents : 0,
      deltaAvailableCents: isAvailable ? toAvailableCents : 0,
      deltaDebtCents: repayDebtCents > 0 ? -repayDebtCents : 0,
      meta: { paymentId: payment.id, orderId: order.id },
    });
  });
}

export async function createAffiliateEarningForStripeSubscriptionRenewal(params: {
  referredUserId: string;
  subscriptionId: string;
  invoiceId: string;
  amountCents: number;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: params.referredUserId },
      select: { id: true, referredById: true },
    });
    if (!user?.referredById) return;
    if (user.referredById === user.id) return;

    const commissionCents = computeCommissionCents(params.amountCents);
    if (commissionCents <= 0) return;

    const { state, availableAt } = computeEarningState({ paymentGateway: "STRIPE" });

    const affiliateUserId = user.referredById;
    await lockUserRow(tx, affiliateUserId);
    const account = await getOrCreateAccount(tx, affiliateUserId);

    const earning = await tx.affiliateEarning.upsert({
      where: {
        sourceType_sourceExternalId_sourceSequence: {
          sourceType: "SUBSCRIPTION_RENEWAL" satisfies AffiliateEarningSourceType,
          sourceExternalId: params.invoiceId,
          sourceSequence: 0,
        },
      },
      create: {
        sourceType: "SUBSCRIPTION_RENEWAL",
        sourceExternalId: params.invoiceId,
        sourceSequence: 0,
        affiliateUserId,
        referredUserId: user.id,
        subscriptionId: params.subscriptionId,
        paymentGateway: "STRIPE",
        grossAmountCents: params.amountCents,
        commissionRateBps: COMMISSION_RATE_BPS,
        commissionCents,
        state,
        availableAt,
      },
      update: { availableAt },
      select: { id: true, commissionCents: true, state: true },
    });

    await createLedgerEntryAndApply(tx, {
      userId: affiliateUserId,
      accountId: account.id,
      kind: "EARNING_CREATED",
      referenceType: "EARNING",
      referenceId: earning.id,
      idempotencyKey: `earning_created:${earning.id}`,
      deltaPendingCents: earning.state === "PENDING" ? earning.commissionCents : 0,
      deltaAvailableCents: earning.state === "AVAILABLE" ? earning.commissionCents : 0,
      meta: { invoiceId: params.invoiceId, subscriptionId: params.subscriptionId },
    });
  });
}

export async function requestAffiliateCashout(params: {
  userId: string;
  amountCents: number;
  walletAddress: string;
}): Promise<{ requestId: string }> {
  const now = new Date();
  const request = await db.$transaction(async (tx) => {
    await lockUserRow(tx, params.userId);
    await matureAffiliateEarningsForUserTx(tx, params.userId);
    const account = await getOrCreateAccount(tx, params.userId);

    // Only allow one active cashout at a time
    const existing = await tx.affiliatePayoutRequest.findFirst({
      where: {
        affiliateUserId: params.userId,
        type: "CASHOUT_USDT",
        status: { in: ["REQUESTED", "APPROVED"] },
      },
      select: { id: true },
    });
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "Cashout request already exists" });
    }

    // Refresh account and check
    const fresh = await tx.affiliateAccount.findUnique({
      where: { id: account.id },
      select: { availableCents: true },
    });
    if ((fresh?.availableCents ?? 0) < params.amountCents) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient available balance" });
    }

    // Convenience: store wallet on user
    await tx.user.update({
      where: { id: params.userId },
      data: { payoutWallet: params.walletAddress },
      select: { id: true },
    });

    const req = await tx.affiliatePayoutRequest.create({
      data: {
        affiliateUserId: params.userId,
        type: "CASHOUT_USDT",
        status: "REQUESTED",
        amountCents: params.amountCents,
        walletAddress: params.walletAddress,
        chain: "polygon",
        token: "usdt",
        createdAt: now,
      },
      select: { id: true, amountCents: true },
    });

    await createLedgerEntryAndApply(tx, {
      userId: params.userId,
      accountId: account.id,
      kind: "PAYOUT_REQUESTED",
      referenceType: "PAYOUT_REQUEST",
      referenceId: req.id,
      idempotencyKey: `payout_requested:${req.id}`,
      deltaAvailableCents: -req.amountCents,
      deltaLockedCents: +req.amountCents,
      meta: { walletAddress: params.walletAddress, chain: "polygon", token: "usdt" },
    });

    return req;
  });

  return { requestId: request.id };
}

export async function exchangeAffiliateCredits(params: {
  userId: string;
  payoutRequestId: string;
  amountCents: number;
  credits: number;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockUserRow(tx, params.userId);
    await matureAffiliateEarningsForUserTx(tx, params.userId);
    const account = await getOrCreateAccount(tx, params.userId);

    const fresh = await tx.affiliateAccount.findUnique({
      where: { id: account.id },
      select: { availableCents: true },
    });
    if ((fresh?.availableCents ?? 0) < params.amountCents) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient available balance" });
    }

    await tx.affiliatePayoutRequest.create({
      data: {
        id: params.payoutRequestId,
        affiliateUserId: params.userId,
        type: "EXCHANGE_CREDITS",
        status: "COMPLETED",
        amountCents: params.amountCents,
        chain: "polygon",
        token: "usdt",
      },
      select: { id: true },
    });

    await createLedgerEntryAndApply(tx, {
      userId: params.userId,
      accountId: account.id,
      kind: "EXCHANGE_CREDITS",
      referenceType: "PAYOUT_REQUEST",
      referenceId: params.payoutRequestId,
      idempotencyKey: `exchange_credits:${params.payoutRequestId}`,
      deltaAvailableCents: -params.amountCents,
      meta: { credits: params.credits },
    });

    // Grant credits via Velobase (idempotent via outerBizId)
    const outerBizId = `affiliate_exchange_${params.payoutRequestId}`;
    await grant({
      userId: params.userId,
      accountType: 'CREDIT',
      subAccountType: 'DEFAULT',
      amount: params.credits,
      outerBizId,
      businessType: 'ADMIN_GRANT',
      referenceId: params.payoutRequestId,
      description: `Affiliate exchange: $${(params.amountCents / 100).toFixed(2)} -> ${params.credits} credits`,
    });
  });
}

export async function adminUpdateAffiliatePayoutRequest(params: {
  requestId: string;
  action: "APPROVE" | "REJECT" | "COMPLETE" | "FAIL";
  txHash?: string | null;
  adminNote?: string | null;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const req = await tx.affiliatePayoutRequest.findUnique({
      where: { id: params.requestId },
      select: { id: true, affiliateUserId: true, status: true, type: true, amountCents: true },
    });
    if (!req) throw new Error("Payout request not found");

    await lockUserRow(tx, req.affiliateUserId);
    const account = await getOrCreateAccount(tx, req.affiliateUserId);

    if (params.action === "REJECT" || params.action === "FAIL") {
      if (req.status === "COMPLETED") throw new Error("Cannot reject/fail a completed payout request");
      if (req.status === "REJECTED" || req.status === "FAILED") return;

      await createLedgerEntryAndApply(tx, {
        userId: req.affiliateUserId,
        accountId: account.id,
        kind: "PAYOUT_RELEASED",
        referenceType: "PAYOUT_REQUEST",
        referenceId: req.id,
        idempotencyKey: `payout_released:${req.id}`,
        deltaLockedCents: -req.amountCents,
        deltaAvailableCents: +req.amountCents,
      });

      await tx.affiliatePayoutRequest.update({
        where: { id: req.id },
        data: { status: params.action === "REJECT" ? "REJECTED" : "FAILED", adminNote: params.adminNote ?? undefined },
        select: { id: true },
      });
      return;
    }

    if (params.action === "APPROVE") {
      await tx.affiliatePayoutRequest.update({
        where: { id: req.id },
        data: { status: "APPROVED", adminNote: params.adminNote ?? undefined },
        select: { id: true },
      });
      return;
    }

    // COMPLETE
    if (req.status === "REJECTED" || req.status === "FAILED") {
      throw new Error("Cannot complete a rejected/failed payout request");
    }
    if (req.type === "CASHOUT_USDT" && !(params.txHash ?? "").trim()) {
      throw new Error("txHash is required to complete cashout");
    }
    if (req.status === "COMPLETED") return;

    await createLedgerEntryAndApply(tx, {
      userId: req.affiliateUserId,
      accountId: account.id,
      kind: "PAYOUT_COMPLETED",
      referenceType: "PAYOUT_REQUEST",
      referenceId: req.id,
      idempotencyKey: `payout_completed:${req.id}`,
      deltaLockedCents: -req.amountCents,
      meta: { txHash: (params.txHash ?? "").trim() || null },
    });

    await tx.affiliatePayoutRequest.update({
      where: { id: req.id },
      data: {
        status: "COMPLETED",
        txHash: req.type === "CASHOUT_USDT" ? (params.txHash ?? "").trim() || null : undefined,
        adminNote: params.adminNote ?? undefined,
      },
      select: { id: true },
    });
  });
}

export async function voidAffiliateEarningsForRefund(params: {
  paymentId: string;
  idempotencyKey: string;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const earning = await tx.affiliateEarning.findFirst({
      where: {
        sourceType: "ORDER_PAYMENT",
        sourceExternalId: params.paymentId,
      },
      select: { id: true, affiliateUserId: true, commissionCents: true, state: true },
    });
    if (!earning) return;
    if (earning.state === "VOIDED") return;

    await lockUserRow(tx, earning.affiliateUserId);
    const account = await getOrCreateAccount(tx, earning.affiliateUserId);

    // Mark earning voided (idempotent)
    await tx.affiliateEarning.updateMany({
      where: { id: earning.id, state: { not: "VOIDED" } },
      data: { state: "VOIDED" },
    });

    // Deduct from buckets (fungible). Prefer the bucket implied by state, then fallback.
    const amt = earning.commissionCents;
    const current = await tx.affiliateAccount.findUnique({
      where: { id: account.id },
      select: { pendingCents: true, availableCents: true, lockedCents: true },
    });
    const pending = current?.pendingCents ?? 0;
    const available = current?.availableCents ?? 0;
    const locked = current?.lockedCents ?? 0;

    let dp = 0, da = 0, dl = 0, dd = 0;
    let remaining = amt;

    const takeFrom = (bucket: "pending" | "available" | "locked", max: number) => {
      const take = Math.min(remaining, Math.max(0, max));
      remaining -= take;
      if (bucket === "pending") dp -= take;
      if (bucket === "available") da -= take;
      if (bucket === "locked") dl -= take;
    };

    if (earning.state === "PENDING") takeFrom("pending", pending);
    if (earning.state === "AVAILABLE") takeFrom("available", available);
    takeFrom("available", available + da); // remaining available after first take
    takeFrom("locked", locked);
    if (remaining > 0) dd += remaining; // debt increases

    await createLedgerEntryAndApply(tx, {
      userId: earning.affiliateUserId,
      accountId: account.id,
      kind: "EARNING_VOIDED",
      referenceType: "EARNING",
      referenceId: earning.id,
      idempotencyKey: params.idempotencyKey,
      deltaPendingCents: dp,
      deltaAvailableCents: da,
      deltaLockedCents: dl,
      deltaDebtCents: dd,
      meta: { paymentId: params.paymentId, commissionCents: amt },
    });
  });
}

export async function voidAffiliateEarningsForStripeInvoiceRefund(params: {
  invoiceId: string;
  idempotencyKey: string;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const earning = await tx.affiliateEarning.findFirst({
      where: {
        sourceType: "SUBSCRIPTION_RENEWAL",
        sourceExternalId: params.invoiceId,
      },
      select: { id: true, affiliateUserId: true, commissionCents: true, state: true },
    });
    if (!earning) return;
    if (earning.state === "VOIDED") return;

    await lockUserRow(tx, earning.affiliateUserId);
    const account = await getOrCreateAccount(tx, earning.affiliateUserId);

    await tx.affiliateEarning.updateMany({
      where: { id: earning.id, state: { not: "VOIDED" } },
      data: { state: "VOIDED" },
    });

    const amt = earning.commissionCents;
    const current = await tx.affiliateAccount.findUnique({
      where: { id: account.id },
      select: { pendingCents: true, availableCents: true, lockedCents: true },
    });
    const pending = current?.pendingCents ?? 0;
    const available = current?.availableCents ?? 0;
    const locked = current?.lockedCents ?? 0;

    let dp = 0, da = 0, dl = 0, dd = 0;
    let remaining = amt;

    const takeFrom = (bucket: "pending" | "available" | "locked", max: number) => {
      const take = Math.min(remaining, Math.max(0, max));
      remaining -= take;
      if (bucket === "pending") dp -= take;
      if (bucket === "available") da -= take;
      if (bucket === "locked") dl -= take;
    };

    if (earning.state === "PENDING") takeFrom("pending", pending);
    if (earning.state === "AVAILABLE") takeFrom("available", available);
    takeFrom("available", available + da);
    takeFrom("locked", locked);
    if (remaining > 0) dd += remaining;

    await createLedgerEntryAndApply(tx, {
      userId: earning.affiliateUserId,
      accountId: account.id,
      kind: "EARNING_VOIDED",
      referenceType: "EARNING",
      referenceId: earning.id,
      idempotencyKey: params.idempotencyKey,
      deltaPendingCents: dp,
      deltaAvailableCents: da,
      deltaLockedCents: dl,
      deltaDebtCents: dd,
      meta: { invoiceId: params.invoiceId, commissionCents: amt },
    });
  });
}


