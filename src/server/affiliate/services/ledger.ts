import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import {
  affiliate,
  affiliateOperation,
} from "@/modules/affiliate/server/service";

const COMMISSION_RATE_BPS = 3000;
const HOLD_MS = 30 * 24 * 60 * 60 * 1000;
function availableAt(gateway: string | null) {
  return new Date(
    Date.now() + (gateway?.toUpperCase() === "NOWPAYMENTS" ? 0 : HOLD_MS),
  );
}

export const matureAffiliateEarningsForUser = (userId: string) =>
  affiliateOperation(() => affiliate.mature(userId));
export const getAffiliateAccountBalances = (userId: string) =>
  affiliateOperation(() => affiliate.balances(userId));

/** Payment/referral lookup and risk policy belong to this commerce host. */
export async function createAffiliateEarningForOrderPayment(
  paymentId: string,
): Promise<void> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: {
        include: { user: { select: { id: true, referredById: true } } },
      },
    },
  });
  if (
    !payment ||
    payment.status !== "SUCCEEDED" ||
    payment.currency.toUpperCase() !== "USD"
  )
    return;
  const order = payment.order;
  if (!order.user.referredById) return;
  await affiliateOperation(() =>
    affiliate.accrue({
      sourceType: "ORDER_PAYMENT",
      sourceExternalId: payment.id,
      affiliateUserId: order.user.referredById,
      referredUserId: order.user.id,
      grossAmountCents: order.amount,
      commissionRateBps: COMMISSION_RATE_BPS,
      availableAt: availableAt(payment.paymentGateway),
      context: {
        orderId: order.id,
        paymentId: payment.id,
        paymentGateway: payment.paymentGateway,
      },
    }),
  );
}

export async function createAffiliateEarningForStripeSubscriptionRenewal(params: {
  referredUserId: string;
  subscriptionId: string;
  invoiceId: string;
  amountCents: number;
}): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: params.referredUserId },
    select: { referredById: true },
  });
  if (!user?.referredById) return;
  await affiliateOperation(() =>
    affiliate.accrue({
      sourceType: "SUBSCRIPTION_RENEWAL",
      sourceExternalId: params.invoiceId,
      affiliateUserId: user.referredById,
      referredUserId: params.referredUserId,
      grossAmountCents: params.amountCents,
      commissionRateBps: COMMISSION_RATE_BPS,
      availableAt: availableAt("STRIPE"),
      context: {
        subscriptionId: params.subscriptionId,
        paymentGateway: "STRIPE",
      },
    }),
  );
}

export async function requestAffiliateCashout(input: {
  userId: string;
  amountCents: number;
  walletAddress: string;
}): Promise<{ requestId: string }> {
  const data = z
    .object({
      userId: z.string().min(1),
      amountCents: z.number().int().min(5000).max(2_147_483_647),
      walletAddress: z
        .string()
        .trim()
        .regex(/^0x[a-fA-F0-9]{40}$/),
    })
    .parse(input);
  const request = await affiliateOperation(() =>
    affiliate.reservePayout({
      ...data,
      id: randomUUID(),
      type: "CASHOUT_USDT",
    }),
  );
  return { requestId: request.id };
}

export async function adminUpdateAffiliatePayoutRequest(params: {
  requestId: string;
  action: "APPROVE" | "REJECT" | "COMPLETE" | "FAIL";
  txHash?: string | null;
  adminNote?: string | null;
}): Promise<void> {
  await affiliateOperation(() => affiliate.updatePayout(params));
}

export async function voidAffiliateEarningsForRefund(params: {
  paymentId: string;
  idempotencyKey: string;
}): Promise<void> {
  await affiliateOperation(() =>
    affiliate.reverse(
      { sourceType: "ORDER_PAYMENT", sourceExternalId: params.paymentId },
      params.idempotencyKey,
    ),
  );
}
export async function voidAffiliateEarningsForStripeInvoiceRefund(params: {
  invoiceId: string;
  idempotencyKey: string;
}): Promise<void> {
  await affiliateOperation(() =>
    affiliate.reverse(
      {
        sourceType: "SUBSCRIPTION_RENEWAL",
        sourceExternalId: params.invoiceId,
      },
      params.idempotencyKey,
    ),
  );
}
