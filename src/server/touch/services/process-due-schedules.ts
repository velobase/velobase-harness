import { randomUUID } from "crypto";
import { isFeatureEnabled } from "@/server/features/state";
import { db } from "@/server/db";
import { logger } from "@/lib/logger";
import {
  TOUCH_LOCK_DURATION_MS,
  TOUCH_RETRY_BASE_DELAY_MS,
  TOUCH_RETRY_MAX_DELAY_MS,
} from "../config/touch";
import { sendEmail } from "@/server/email";
import { renderSubscriptionRenewalReminderEmail } from "./render-subscription-renewal-reminder-email";
import { buildManageSubscriptionUrl, normalizeReferenceType } from "./utils";
import { getStripeClient } from "@/server/order/providers/stripe";

type TouchPayload = {
  template?: string;
  periodEndAt?: string;
  cycleId?: string;
  manageUrl?: string;
};

/**
 * 简单模板变量替换 {{variable}}
 */
function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => vars[key] ?? "",
  );
}

/**
 * 根据 TouchTemplate 渲染邮件内容
 */
function renderEmailFromTemplate(
  template: {
    subject: string | null;
    bodyText: string | null;
    bodyHtml: string | null;
  },
  vars: Record<string, string>,
): { subject: string; text: string; html: string } | null {
  if (!template.subject || !template.bodyText || !template.bodyHtml) {
    return null;
  }
  return {
    subject: renderTemplate(template.subject, vars),
    text: renderTemplate(template.bodyText, vars),
    html: renderTemplate(template.bodyHtml, vars),
  };
}

function computeBackoffDelayMs(attempt: number): number {
  const pow = Math.max(0, attempt - 1);
  const delay = TOUCH_RETRY_BASE_DELAY_MS * Math.pow(2, pow);
  return Math.min(delay, TOUCH_RETRY_MAX_DELAY_MS);
}

export async function processDueTouchSchedules(params?: {
  batchSize?: number;
}) {
  if (!(await isFeatureEnabled("touch"))) {
    logger.info("Touch feature disabled, skipping due schedule processing");
    return { ok: true, processed: 0 };
  }

  const batchSize = params?.batchSize ?? 50;
  const now = new Date();
  const lockId = randomUUID();
  const lockExpiredBefore = new Date(now.getTime() - TOUCH_LOCK_DURATION_MS);

  // Fetch a candidate batch first; then claim one-by-one with optimistic update.
  const candidates = await db.touchSchedule.findMany({
    where: {
      referenceType: { not: "OUTREACH" },
      status: { in: ["PENDING", "PROCESSING"] },
      nextAttemptAt: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: lockExpiredBefore } }],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: batchSize,
  });

  if (candidates.length === 0) {
    return { ok: true, processed: 0 };
  }

  let processed = 0;

  for (const c of candidates) {
    if (!(await isFeatureEnabled("touch"))) break;
    const claim = await db.touchSchedule.updateMany({
      where: {
        id: c.id,
        status: { in: ["PENDING", "PROCESSING"] },
        OR: [{ lockedAt: null }, { lockedAt: { lt: lockExpiredBefore } }],
      },
      data: {
        status: "PROCESSING",
        lockedAt: now,
        lockId,
      },
    });

    if (claim.count !== 1) continue;

    try {
      await processSingleSchedule(c.id, lockId);
      processed += 1;
    } catch (err) {
      logger.error(
        { scheduleId: c.id, err },
        "Failed processing touch schedule (unexpected)",
      );
      processed += 1;
    }
  }

  return { ok: true, processed };
}

async function processSingleSchedule(scheduleId: string, lockId: string) {
  const now = new Date();

  const schedule = await db.touchSchedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) return;
  if (schedule.lockId !== lockId) return;
  if (schedule.status !== "PROCESSING") return;

  // Basic safety checks
  const refType = normalizeReferenceType(schedule.referenceType);
  if (refType !== "SUBSCRIPTION_CYCLE") {
    await failSchedule(scheduleId, lockId, "Unsupported reference type");
    return;
  }

  const user = await db.user.findUnique({
    where: { id: schedule.userId },
    select: { email: true, emailBounced: true, emailComplained: true },
  });

  if (!user?.email) {
    await cancelSchedule(scheduleId, lockId, "Missing user email");
    return;
  }
  if (user.emailBounced || user.emailComplained) {
    await cancelSchedule(
      scheduleId,
      lockId,
      "Email disabled (bounce/complaint)",
    );
    return;
  }

  // For the renewal reminder: ensure subscription is still ACTIVE and not cancel_at_period_end.
  const cycle = await db.userSubscriptionCycle.findUnique({
    where: { id: schedule.referenceId },
    include: { subscription: true },
  });
  if (!cycle?.subscription) {
    await cancelSchedule(scheduleId, lockId, "Cycle not found");
    return;
  }
  if (cycle.subscription.status !== "ACTIVE") {
    await cancelSchedule(scheduleId, lockId, "Subscription not active");
    return;
  }
  if (cycle.expiresAt <= now) {
    await cancelSchedule(scheduleId, lockId, "Cycle already expired");
    return;
  }

  // Real-time check: For Stripe subscriptions, verify cancel_at_period_end directly from Stripe API
  // This ensures we don't send renewal reminders if user just canceled in Stripe Portal
  const gatewaySubId = cycle.subscription.gatewaySubscriptionId;
  const isStripeSubscription =
    cycle.subscription.gateway === "stripe" && gatewaySubId?.startsWith("sub_");

  if (isStripeSubscription && gatewaySubId) {
    try {
      const stripe = getStripeClient();
      const stripeSub = await stripe.subscriptions.retrieve(gatewaySubId);

      // Check cancel_at_period_end (traditional way)
      if (stripeSub.cancel_at_period_end) {
        // Sync DB state and cancel the reminder
        await db.userSubscription.update({
          where: { id: cycle.subscription.id },
          data: { cancelAtPeriodEnd: true },
        });
        await cancelSchedule(
          scheduleId,
          lockId,
          "Stripe subscription cancel_at_period_end=true (real-time check)",
        );
        logger.info(
          { subscriptionId: cycle.subscription.id, gatewaySubId },
          "Cancelled renewal reminder after Stripe real-time check",
        );
        return;
      }

      // Check cancel_at (newer way - subscription scheduled to cancel at specific time)
      // If cancel_at is set and is in the future, user has scheduled cancellation
      if (stripeSub.cancel_at) {
        const cancelAtDate = new Date(stripeSub.cancel_at * 1000);
        // Sync DB state and cancel the reminder
        await db.userSubscription.update({
          where: { id: cycle.subscription.id },
          data: {
            cancelAtPeriodEnd: true,
            canceledAt: stripeSub.canceled_at
              ? new Date(stripeSub.canceled_at * 1000)
              : new Date(),
          },
        });
        await cancelSchedule(
          scheduleId,
          lockId,
          `Stripe subscription cancel_at=${cancelAtDate.toISOString()} (real-time check)`,
        );
        logger.info(
          {
            subscriptionId: cycle.subscription.id,
            gatewaySubId,
            cancelAt: cancelAtDate,
          },
          "Cancelled renewal reminder - subscription scheduled to cancel",
        );
        return;
      }

      // Also check if subscription is not active
      if (stripeSub.status !== "active" && stripeSub.status !== "trialing") {
        await cancelSchedule(
          scheduleId,
          lockId,
          `Stripe subscription status=${stripeSub.status}`,
        );
        return;
      }
    } catch (err) {
      // If Stripe API fails, fall back to DB check but log the error
      logger.warn(
        { err, gatewaySubId, subscriptionId: cycle.subscription.id },
        "Failed to verify subscription with Stripe API, falling back to DB check",
      );
      // Fallback: use DB cancelAtPeriodEnd
      if (cycle.subscription.cancelAtPeriodEnd) {
        await cancelSchedule(
          scheduleId,
          lockId,
          "Subscription cancel_at_period_end=true (DB fallback)",
        );
        return;
      }
    }
  } else {
    // Non-Stripe subscriptions: use DB cancelAtPeriodEnd
    if (cycle.subscription.cancelAtPeriodEnd) {
      await cancelSchedule(
        scheduleId,
        lockId,
        "Subscription cancel_at_period_end=true",
      );
      return;
    }
  }

  const payload = (schedule.payload ?? {}) as unknown as TouchPayload;
  const periodEndAtIso = payload.periodEndAt ?? cycle.expiresAt.toISOString();
  const manageUrl = payload.manageUrl ?? buildManageSubscriptionUrl();

  // 尝试从 TouchTemplate 读取模板
  let email: { subject: string; text: string; html: string } | null = null;
  let usedTemplateId: string | null = null;

  const sceneKey = schedule.sceneKey;
  if (sceneKey) {
    // 查找场景下默认激活的模板（优先 isDefault，fallback 到任意激活模板）
    const template = await db.touchTemplate.findFirst({
      where: { sceneKey, isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, subject: true, bodyText: true, bodyHtml: true },
    });
    if (template) {
      email = renderEmailFromTemplate(template, { periodEndAtIso, manageUrl });
      usedTemplateId = template.id;
    }
  }

  // Fallback: 使用硬编码模板
  if (!email) {
    email = renderSubscriptionRenewalReminderEmail({ periodEndAtIso });
  }

  const attemptNumber = schedule.attemptCount + 1;

  try {
    const result = await sendEmail({
      to: user.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    await db.$transaction(async (tx) => {
      await tx.touchRecord.create({
        data: {
          scheduleId: schedule.id,
          attemptNumber,
          templateId: usedTemplateId,
          provider: result.provider,
          providerMessageId:
            result.messageId === "unknown" ? null : result.messageId,
          toEmail: user.email!,
          subject: email.subject,
          status: "SENT",
          meta: {
            provider: result.provider,
            sceneKey: sceneKey ?? null,
            templateId: usedTemplateId,
            schedulePayload: schedule.payload ?? null,
            rendered: {
              subject: email.subject,
              text: email.text,
              html: email.html,
            },
          } as object,
        },
      });

      await tx.touchSchedule.update({
        where: { id: schedule.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          attemptCount: attemptNumber,
          lockedAt: null,
          lockId: null,
          lastError: null,
        },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const nextAttempt =
      attemptNumber >= schedule.maxAttempts
        ? null
        : new Date(now.getTime() + computeBackoffDelayMs(attemptNumber));

    await db.$transaction(async (tx) => {
      await tx.touchRecord.create({
        data: {
          scheduleId: schedule.id,
          attemptNumber,
          templateId: usedTemplateId,
          provider: process.env.EMAIL_PROVIDER || "auto",
          providerMessageId: null,
          toEmail: user.email!,
          subject: email.subject,
          status: "FAILED",
          error: message,
          meta: {
            reason: message,
            sceneKey: sceneKey ?? null,
            templateId: usedTemplateId,
            schedulePayload: schedule.payload ?? null,
            rendered: {
              subject: email.subject,
              text: email.text,
              html: email.html,
            },
          } as object,
        },
      });

      await tx.touchSchedule.update({
        where: { id: schedule.id },
        data: {
          status: attemptNumber >= schedule.maxAttempts ? "FAILED" : "PENDING",
          attemptCount: attemptNumber,
          nextAttemptAt: nextAttempt ?? schedule.nextAttemptAt,
          lockedAt: null,
          lockId: null,
          lastError: message,
        },
      });
    });
  }
}

async function cancelSchedule(
  scheduleId: string,
  lockId: string,
  reason: string,
) {
  await db.touchSchedule.updateMany({
    where: { id: scheduleId, lockId, status: "PROCESSING" },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      lockedAt: null,
      lockId: null,
      lastError: reason,
    },
  });
}

async function failSchedule(
  scheduleId: string,
  lockId: string,
  reason: string,
) {
  await db.touchSchedule.updateMany({
    where: { id: scheduleId, lockId, status: "PROCESSING" },
    data: {
      status: "FAILED",
      lockedAt: null,
      lockId: null,
      lastError: reason,
    },
  });
}
