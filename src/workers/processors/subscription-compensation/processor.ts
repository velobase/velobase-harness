/**
 * Subscription Compensation Processor
 *
 * 订阅续费 / 提前转正补偿：
 * - 兜底 Stripe webhook 失败或处理异常导致的：
 *   - 仍然处于 TRIAL 周期
 *   - 但 Stripe 已经对该订阅成功扣款（invoice.payment_succeeded）
 *   - 且本地尚未创建 REGULAR 周期 / 发放会员积分
 */
import type { Job } from "bullmq";
import type Stripe from "stripe";
import { createLogger } from "@/lib/logger";
import { db } from "@/server/db";
import type { SubscriptionCompensationJobData } from "../../queues/subscription-compensation.queue";
import { onSubscriptionRenewed } from "@/server/order/services/webhook-handlers/subscription-renewed";
import { getStripe } from "@/server/order/services/stripe/client";
import type { WebhookEvent } from "@/server/order/providers/types";

const logger = createLogger("subscription-compensation");

export async function processSubscriptionCompensationJob(
  job: Job<SubscriptionCompensationJobData>,
): Promise<void> {
  const { type, subscriptionId } = job.data;

  if (type === "manual-check" && subscriptionId) {
    await compensateSingleSubscription(subscriptionId);
    return;
  }

  if (type === "scheduled-scan") {
    await scanAndCompensateSubscriptions();
  }
}

async function scanAndCompensateSubscriptions(): Promise<void> {
  const subscriptions = await db.userSubscription.findMany({
    where: { gateway: "STRIPE", deletedAt: null, status: "ACTIVE" },
    include: { cycles: { orderBy: { sequenceNumber: "desc" } } },
    take: 50,
  });

  if (subscriptions.length === 0) {
    logger.info("No Stripe subscriptions found for compensation scan");
    return;
  }

  logger.info({ count: subscriptions.length }, "Scanning subscriptions for potential compensation");

  for (const sub of subscriptions) {
    try {
      await compensateSubscriptionIfNeeded(sub.id);
    } catch (error) {
      logger.error({ subscriptionId: sub.id, error }, "Failed to compensate subscription");
    }
  }
}

async function compensateSingleSubscription(subscriptionId: string): Promise<void> {
  await compensateSubscriptionIfNeeded(subscriptionId);
}

async function compensateSubscriptionIfNeeded(subscriptionId: string): Promise<void> {
  const subscription = await db.userSubscription.findUnique({
    where: { id: subscriptionId },
    include: { cycles: { orderBy: { sequenceNumber: "desc" } } },
  });

  if (!subscription) {
    logger.warn({ subscriptionId }, "Subscription not found");
    return;
  }

  if (subscription.gateway !== "STRIPE" || !subscription.gatewaySubscriptionId) return;

  const activeTrial = subscription.cycles.find(c => c.status === "ACTIVE" && c.type === "TRIAL");
  const hasRegularCycle = subscription.cycles.some(c => c.type === "REGULAR");
  if (!activeTrial || hasRegularCycle) return;

  let invoices: Stripe.ApiList<Stripe.Invoice> | null = null;
  try {
    invoices = await getStripe().invoices.list({ subscription: subscription.gatewaySubscriptionId, limit: 5 });
  } catch (error) {
    logger.warn({ subscriptionId: subscription.id, error }, "Failed to list invoices from Stripe");
    return;
  }

  if (!invoices || invoices.data.length === 0) return;

  const paidInvoice = invoices.data.find(
    inv => inv.status === "paid" && (inv.amount_paid ?? 0) > 0 &&
      (inv.billing_reason === "subscription_update" || inv.billing_reason === "subscription_cycle"),
  );

  if (!paidInvoice) return;

  // Construct a normalized WebhookEvent for the renewal handler
  const event: WebhookEvent = {
    type: "subscription.renewed",
    transactionId: paidInvoice.id,
    subscriptionId: subscription.gatewaySubscriptionId,
    amount: paidInvoice.amount_paid ?? undefined,
    currency: paidInvoice.currency ?? undefined,
    raw: paidInvoice,
  };

  logger.info({
    subscriptionId: subscription.id,
    gatewaySubscriptionId: subscription.gatewaySubscriptionId,
    invoiceId: paidInvoice.id,
    billingReason: paidInvoice.billing_reason,
    amountPaid: paidInvoice.amount_paid,
  }, "Triggering subscription renewal compensation via worker");

  await onSubscriptionRenewed(event, "STRIPE");
}
