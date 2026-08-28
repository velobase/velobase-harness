/**
 * Payment Reconciliation Processor
 *
 * Hourly (every hour 00:00 server time):
 * - Stripe: enqueue manual-check to order-compensation (webhook fallback)
 * - NowPayments: actively poll & sync pending payments via getPayment() (webhook fallback)
 *
 * Daily:
 * - At LA 00:00 hour (detected inside the hourly trigger), send daily summary.
 */
import type { Job } from "bullmq";
import { createLogger } from "@/lib/logger";
import { db } from "@/server/db";
import { getLarkBot, LARK_CHAT_IDS } from "@/lib/lark";
import { getStripe } from "@/server/order/services/stripe/client";
import type { PaymentReconciliationJobData } from "@/workers/queues/payment-reconciliation.queue";
import { getCurrentLAHour, getDailyWindowLA, getHourlyWindowLA } from "../billing-reconciliation/time";
import { BILLING_RECONCILIATION_AT } from "../billing-reconciliation/constants";
import { PAYMENT_RECONCILIATION_THRESHOLDS } from "./constants";
import { buildPaymentReconciliationCard, buildPaymentReconciliationDailyCard } from "./build-card";
import { env } from "@/env";

const logger = createLogger("payment-reconciliation");

const SUCCESS_STATUSES = ["COMPLETED", "PAID", "SUCCEEDED"] as const;

function toUsd(amountCents: number): number {
  return amountCents / 100;
}

function pLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    const fn = queue.shift();
    if (fn) fn();
  };
  return async <T>(fn: () => Promise<T>): Promise<T> =>
    await new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn()
          .then((v) => {
            resolve(v);
            next();
          })
          .catch((e) => {
            reject(e instanceof Error ? e : new Error(String(e)));
            next();
          });
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
}

export async function processPaymentReconciliation(job: Job<PaymentReconciliationJobData>): Promise<void> {
  if (job.data.type !== "hourly-reconcile") return;

  // Local dry-run support:
  // - default only run in production
  // - set PAYMENT_RECONCILIATION_FORCE=1 to run locally
  if (env.NODE_ENV !== "production" && !env.PAYMENT_RECONCILIATION_FORCE) {
    logger.info("Skipping payment reconciliation in non-production environment");
    return;
  }

  const bot = getLarkBot();
  const chatId = LARK_CHAT_IDS.BILLING_RECONCILIATION;

  const laHour = getCurrentLAHour(new Date());
  const isDaily = laHour === 0;

  // Industry convention:
  // - Hourly boundary: every hour 00:00, reconcile previous full hour
  // - Daily boundary: 00:00:00 (LA), only send daily report (no extra hourly report at that moment)
  if (isDaily) {
    const daily = getDailyWindowLA(new Date());
    await runDaily(daily.start, daily.end, daily.label);
    return;
  }

  const hourly = getHourlyWindowLA(new Date());
  await runHourly(hourly.start, hourly.end, hourly.label);

  async function runHourly(start: Date, end: Date, label: string) {
    const now = new Date();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);

    // -------- Stripe: read-only status checks for pending payments --------
    const stripePending = await db.payment.findMany({
      where: {
        paymentGateway: "STRIPE",
        status: "PENDING",
        deletedAt: null,
        createdAt: { lt: fiveMinutesAgo, gt: twoDaysAgo },
        expiresAt: { gt: now },
      },
      select: { id: true, createdAt: true, gatewayTransactionId: true, extra: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    let stripePaidButStillPending = 0;
    if (stripePending.length > 0) {
      try {
        const stripe = getStripe();
        const limit = pLimit(5);

        await Promise.all(
          stripePending.map((p) =>
            limit(async () => {
              const extra = p.extra as { stripe?: { checkoutSessionId?: string | null } } | null | undefined;
              const cs =
                typeof extra?.stripe?.checkoutSessionId === "string" ? extra?.stripe?.checkoutSessionId : undefined;
              const pi = typeof p.gatewayTransactionId === "string" ? p.gatewayTransactionId : undefined;

              // Prefer PI if available
              if (pi?.startsWith("pi_")) {
                const intent = await stripe.paymentIntents.retrieve(pi);
                if (intent.status === "succeeded") stripePaidButStillPending += 1;
                return;
              }
              if (cs?.startsWith("cs_")) {
                const session = await stripe.checkout.sessions.retrieve(cs);
                if (session.payment_status === "paid") stripePaidButStillPending += 1;
              }
            })
          )
        );
      } catch (e) {
        // If Stripe env missing, don't fail the whole reconciliation
        logger.warn({ error: e }, "Stripe read-only checks skipped/failed");
      }
    }

    const stripeSucceededButOrderNotFulfilled = await db.payment.findMany({
      where: {
        paymentGateway: "STRIPE",
        status: "SUCCEEDED",
        deletedAt: null,
        createdAt: { gte: start, lt: end },
        order: { deletedAt: null, status: { not: "FULFILLED" } },
      },
      select: { id: true },
      take: 20,
    });

    // -------- NowPayments: read-only status checks for pending payments --------
    const npPending = await db.payment.findMany({
      where: {
        paymentGateway: "NOWPAYMENTS",
        status: "PENDING",
        deletedAt: null,
        createdAt: { lt: fiveMinutesAgo, gt: twoDaysAgo },
        expiresAt: { gt: now },
      },
      select: { id: true, gatewayTransactionId: true, extra: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    let npChecked = 0;
    let npToSucceeded = 0;
    let npToFailed = 0;
    let npToExpired = 0;
    let npToRefunded = 0;
    let npStillPending = 0;
    let npErrors = 0;
    let npFinishedButStillPending = 0;

    if (npPending.length > 0) {
      try {
        const { getNowPaymentsPaymentStatus } = await import("@/server/order/providers/nowpayments");
        const limit = pLimit(5);
        await Promise.all(
          npPending.map((p) =>
            limit(async () => {
              const extra = p.extra && typeof p.extra === "object" ? (p.extra as Record<string, unknown>) : {};
              const np = extra.nowpayments && typeof extra.nowpayments === "object" ? (extra.nowpayments as Record<string, unknown>) : {};
              const npPaymentId =
                typeof np.payment_id === "string" || typeof np.payment_id === "number"
                  ? String(np.payment_id)
                  : typeof p.gatewayTransactionId === "string" && p.gatewayTransactionId.length > 0
                    ? p.gatewayTransactionId
                    : null;
              if (!npPaymentId) {
                npErrors += 1;
                return;
              }

              const status = await getNowPaymentsPaymentStatus(npPaymentId);
              npChecked += 1;
              const s = (status.payment_status ?? "").toLowerCase();
              if (s === "finished") {
                npToSucceeded += 1;
                npFinishedButStillPending += 1;
              } else if (s === "failed") npToFailed += 1;
              else if (s === "expired") npToExpired += 1;
              else if (s === "refunded") npToRefunded += 1;
              else npStillPending += 1;
            })
          )
        );
      } catch (e) {
        logger.warn({ error: e }, "NowPayments read-only checks skipped/failed");
        npErrors += npPending.length;
      }
    }

    const npTerminalUpdates = npToSucceeded + npToFailed + npToExpired + npToRefunded;

    const danger =
      stripeSucceededButOrderNotFulfilled.length >= PAYMENT_RECONCILIATION_THRESHOLDS.succeededButNotFulfilled ||
      stripePending.length >= PAYMENT_RECONCILIATION_THRESHOLDS.pendingBacklog ||
      npPending.length >= PAYMENT_RECONCILIATION_THRESHOLDS.pendingBacklog ||
      npTerminalUpdates >= PAYMENT_RECONCILIATION_THRESHOLDS.nowpaymentsTerminalUpdates;

    const mentionMd = danger ? `🚨 异常触发：<at id=${BILLING_RECONCILIATION_AT.openId}></at>` : undefined;

    const card = buildPaymentReconciliationCard({
      title: "对账(小时) - Stripe & NowPayments",
      windowLabel: label,
      mentionMd,
      stripe: {
        pendingCandidates: stripePending.length,
        paidButStillPending: stripePaidButStillPending,
        succeededButOrderNotFulfilled: stripeSucceededButOrderNotFulfilled.length,
        samplePaymentIds: stripeSucceededButOrderNotFulfilled.map((x) => x.id).slice(0, 8),
      },
      nowpayments: {
        pendingCandidates: npPending.length,
        checked: npChecked,
        updatedToSucceeded: npToSucceeded,
        updatedToFailed: npToFailed,
        updatedToExpired: npToExpired,
        updatedToRefunded: npToRefunded,
        stillPending: npStillPending,
        errors: npErrors,
        finishedButStillPending: npFinishedButStillPending,
        samplePaymentIds: npPending.map((x) => x.id).slice(0, 8),
      },
    });

    await bot.sendCard(chatId, card);
    logger.info({ label, chatId }, "Hourly payment reconciliation sent");
  }

  async function runDaily(start: Date, end: Date, label: string) {
    const [successPayments, orders] = await Promise.all([
      db.payment.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          deletedAt: null,
          status: { in: SUCCESS_STATUSES as unknown as string[] },
          paymentGateway: { in: ["STRIPE", "NOWPAYMENTS"] },
        },
        select: { id: true, orderId: true, paymentGateway: true, amount: true, status: true },
      }),
      db.order.findMany({
        where: { createdAt: { gte: start, lt: end }, deletedAt: null },
        select: { id: true, status: true, amount: true },
      }),
    ]);

    const ordersById = new Map<string, (typeof orders)[number]>();
    for (const o of orders) ordersById.set(o.id, o);

    const byGateway = new Map<"STRIPE" | "NOWPAYMENTS", typeof successPayments>();
    for (const p of successPayments) {
      const g = p.paymentGateway as "STRIPE" | "NOWPAYMENTS";
      const arr = byGateway.get(g) ?? [];
      arr.push(p);
      byGateway.set(g, arr);
    }

    function analyze(gateway: "STRIPE" | "NOWPAYMENTS") {
      const pays = byGateway.get(gateway) ?? [];
      const sumUsd = pays.reduce((s, p) => s + toUsd(p.amount), 0);

      const paidButOrderNotFulfilled: string[] = [];
      const paidSumMismatch: string[] = [];

      const paysByOrder = new Map<string, typeof pays>();
      for (const p of pays) {
        const arr = paysByOrder.get(p.orderId) ?? [];
        arr.push(p);
        paysByOrder.set(p.orderId, arr);
      }

      for (const [oid, arr] of paysByOrder.entries()) {
        const order = ordersById.get(oid);
        if (!order) continue;
        const paidSum = arr.reduce((s, p) => s + p.amount, 0);

        if (order.status !== "FULFILLED") paidButOrderNotFulfilled.push(oid);
        if (order.status === "FULFILLED" && paidSum !== order.amount) paidSumMismatch.push(oid);
      }

      const anomalies = paidButOrderNotFulfilled.length + paidSumMismatch.length;
      const lines: string[] = [];
      if (paidButOrderNotFulfilled.length)
        lines.push(`- ${gateway}: paid但未履约: ${paidButOrderNotFulfilled.slice(0, 6).join(", ")}`);
      if (paidSumMismatch.length)
        lines.push(`- ${gateway}: 金额不一致: ${paidSumMismatch.slice(0, 6).join(", ")}`);

      return { count: pays.length, sumUsd, anomalies, lines };
    }

    const stripe = analyze("STRIPE");
    const nowpayments = analyze("NOWPAYMENTS");
    const anomalyLines = [...stripe.lines, ...nowpayments.lines].slice(0, 10);

    const danger =
      stripe.anomalies >= PAYMENT_RECONCILIATION_THRESHOLDS.dailyAnomalies ||
      nowpayments.anomalies >= PAYMENT_RECONCILIATION_THRESHOLDS.dailyAnomalies;
    const mentionMd = danger ? `🚨 日对账异常：<at id=${BILLING_RECONCILIATION_AT.openId}></at>` : undefined;

    const card = buildPaymentReconciliationDailyCard({
      title: "对账(天) - Stripe & NowPayments",
      windowLabel: label,
      mentionMd,
      stripe: { successPayments: stripe.count, sumUsd: stripe.sumUsd, anomalies: stripe.anomalies },
      nowpayments: { successPayments: nowpayments.count, sumUsd: nowpayments.sumUsd, anomalies: nowpayments.anomalies },
      anomalyLines,
    });

    await bot.sendCard(chatId, card);
    logger.info({ label, chatId }, "Daily payment reconciliation sent");
  }
}

