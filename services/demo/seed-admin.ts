import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../../src/server/db";
import { env } from "../../src/env";
import { localDemoEnabled, localDemoEmail } from "../../src/server/auth/local-demo";

// These records belong only to the existing, isolated Harness preview database.
const target = new URL(env.DATABASE_URL);
if (
  !localDemoEnabled ||
  target.pathname !== "/harness_preview" ||
  target.username !== "harness_demo" ||
  !((target.hostname === "127.0.0.1" && target.port === "54333") ||
    (target.hostname === "postgres" && target.port === "5432"))
) throw new Error("Admin demo data requires the local Harness preview database.");

function id(key: string) {
  const hex = createHash("sha256").update(`harness-admin-demo-v1:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const now = new Date();
const days = (offset: number) => new Date(now.getTime() + offset * 86_400_000);
const names = [
  "林晓 · 产品设计", "Alex Morgan", "陈晨", "Sofia Martinez", "王一诺", "James Wilson",
  "李沐阳", "Emma Thompson", "张可欣", "Noah Kim", "赵子涵", "Mia Patel",
  "周予安", "Oliver Chen", "吴思远", "Amelia Brown", "徐嘉宁", "Lucas Martin",
  "孙语桐", "Isabella Rossi", "马承宇", "Ethan Davis", "朱若曦", "Ava Garcia",
  "胡景行", "Charlotte Lee", "何知夏", "Benjamin Taylor",
  "欧阳慕容 · 国际业务与跨地区协作项目负责人", null, "演示受限账户", "新注册用户",
];
const userIds = names.map((_, i) => id(`user-${i}`));
const emails = names.map((_, i) => `demo.user${String(i + 1).padStart(2, "0")}@example.test`);

async function main() {
  // Create-only rows preserve changes made while touring Admin. All tables commit together.
  const inserted = await db.$transaction(async (tx) => {
    const counts: Record<string, number> = {};
    const admin = await tx.user.findUniqueOrThrow({ where: { email: localDemoEmail } });
    counts.users = (await tx.user.createMany({ skipDuplicates: true, data: names.map((name, i) => ({
      id: userIds[i]!, name, email: emails[i]!, emailVerified: i === 31 ? null : days(-60 - i),
      createdAt: i === 31 ? days(-0.05) : days(-60 - i),
      timezone: i % 2 ? "America/New_York" : "Asia/Shanghai",
      countryCode: i % 2 ? "US" : "CN", countryCodeSource: "AUTO",
      utmSource: i % 3 === 0 ? "newsletter" : i % 3 === 1 ? "google" : null,
      utmMedium: i % 3 === 0 ? "email" : i % 3 === 1 ? "organic" : null,
      utmCampaign: i % 3 === 0 ? "harness_demo_launch" : null,
      isBlocked: i === 30, blockedReason: i === 30 ? "ADMIN_MANUAL" : null,
      blockedAt: i === 30 ? days(-2) : null,
      hasPurchased: i < 28,
      deviceKeyAtSignup: i === 31 ? null : `demo-device-${i === 30 ? 29 : i}`,
      signupIp: `192.0.2.${i + 1}`,
      referralCode: i < 2 ? `DEMO-PARTNER-${i + 1}` : null,
      referredById: i >= 2 && i < 28 ? userIds[i < 14 ? 0 : 1] : null,
      affiliateEnabledAt: i < 2 ? days(-90) : null,
      // A visibly non-payable identifier, never a real wallet.
      payoutWallet: i < 2 ? `DEMO-WALLET-${i + 1}-NOT-FOR-PAYMENT` : null,
    })) })).count;
    await tx.userAttribution.createMany({ skipDuplicates: true, data: userIds.slice(0, 28).map((userId, i) => ({
      id: id(`attribution-${i}`), userId, firstTouchAt: days(-60 - i), landingPath: "/pricing",
      refHost: i % 2 ? "google.com" : "newsletter.example.test",
      channel: i % 2 ? "organic_search" : "referral", refType: i % 2 ? "search" : "referral",
      utmSource: i % 2 ? "google" : "newsletter", utmCampaign: "harness_demo_launch",
    })) });

    const products: Prisma.ProductCreateManyInput[] = [
      { id: id("product-0"), name: "Demo · Studio Monthly", type: "SUBSCRIPTION", price: 4900, originalPrice: 6900, interval: "month", hasTrial: true, trialDays: 7, trialCreditsAmount: 500 },
      { id: id("product-1"), name: "Demo · 团队年度方案 / International Collaboration", type: "SUBSCRIPTION", price: 59000, originalPrice: 82800, interval: "year" },
      { id: id("product-2"), name: "Demo · 2,000 Credits", type: "CREDITS_PACKAGE", price: 1900, originalPrice: 2500 },
      { id: id("product-3"), name: "Demo · Launch draft", type: "CREDITS_PACKAGE", price: 990, status: "INACTIVE", isAvailable: false },
      { id: id("product-4"), name: "Demo · 已下架的历史套餐", type: "CREDITS_PACKAGE", price: 2900, status: "INACTIVE", isAvailable: false },
    ].map((product, i) => ({
      currency: "usd", status: "ACTIVE", isAvailable: true, sortOrder: 200 + i,
      description: { en: "Local Admin sample product.", zh: "本地 Admin 演示商品。", features: ["中英文内容", "Long-form product details", "Local demonstration only"] },
      metadata: { demo: true, audience: "Admin UI review", notes: "Stored in the local preview database; no payment provider is connected." },
      createdAt: days(-50), ...product,
    } as Prisma.ProductCreateManyInput));
    counts.products = (await tx.product.createMany({ data: products, skipDuplicates: true })).count;
    const plans: Prisma.SubscriptionPlanCreateManyInput[] = [0, 1].map((i) => ({
      id: id(`plan-${i}`), name: i ? "Demo Team Annual" : "Demo Studio", type: i ? "PREMIUM" : "PLUS",
      interval: i ? "YEAR" : "MONTH", intervalCount: 1, status: "ACTIVE", creditsPerPeriod: i ? 120000 : 10000,
    }));
    await tx.subscriptionPlan.createMany({ data: plans, skipDuplicates: true });
    await tx.productSubscription.createMany({ skipDuplicates: true, data: [0, 1].map((i) => ({ id: id(`product-subscription-${i}`), productId: id(`product-${i}`), planId: id(`plan-${i}`) })) });
    await tx.productCreditsPackage.createMany({ skipDuplicates: true, data: [2, 3, 4].map((i) => ({ id: id(`credits-package-${i}`), productId: id(`product-${i}`), creditsAmount: i === 2 ? 2000 : 1000 })) });
    await tx.productPrice.createMany({ skipDuplicates: true, data: products.flatMap((product, i) => ["USD", "EUR", "GBP", "CHF"].map((currency, j) => ({
      id: id(`price-${i}-${currency}`), productId: product.id!, currency,
      amount: Math.round(Number(product.price) * [1, 0.94, 0.81, 0.9][j]!),
      originalAmount: Math.round(Number(product.originalPrice ?? product.price) * [1, 0.94, 0.81, 0.9][j]!),
    }))) });

    const orders: Prisma.OrderCreateManyInput[] = Array.from({ length: 48 }, (_, i) => {
      const product = products[i % 3]!;
      return {
        id: id(`order-${i}`), userId: userIds[i % 28]!, productId: product.id!,
        productSnapshot: { id: product.id!, name: product.name, type: product.type, price: product.price, currency: "usd", demo: true },
        status: i < 32 ? "COMPLETED" : ["PENDING", "CANCELLED", "EXPIRED", "COMPLETED"][i % 4]!,
        type: "NEW_PURCHASE",
        amount: product.price, currency: "usd", createdAt: days(-i - 0.01),
        updatedAt: days(-i), expiresAt: i >= 32 && i % 4 === 0 ? days(7) : days(-i + 0.1),
      };
    });
    counts.orders = (await tx.order.createMany({ data: orders, skipDuplicates: true })).count;
    const payments: Prisma.PaymentCreateManyInput[] = orders.flatMap((order, i) => {
      if (order.status === "CANCELLED") return [];
      const payment: Prisma.PaymentCreateManyInput = {
        id: id(`payment-${i}`), orderId: order.id!, userId: order.userId, amount: order.amount, currency: order.currency,
        status: order.status === "COMPLETED" ? "SUCCESS" : order.status === "EXPIRED" ? "FAILED" : "PENDING",
        paymentGateway: "LOCAL_DEMO", gatewayTransactionId: `demo_transaction_${i}`,
        isSubscription: i % 3 < 2, expiresAt: order.expiresAt, createdAt: order.createdAt, updatedAt: order.updatedAt,
        gatewayResponse: { demo: true, message: order.status === "EXPIRED" ? "Payment session expired before confirmation." : "Local preview record; no charge occurred." },
        extra: { demo: true, method: "card", last4: "4242" },
      };
      return i % 7 === 0 && order.status === "COMPLETED" ? [
        { ...payment, id: id(`payment-failed-${i}`), status: "FAILED", gatewayTransactionId: `demo_declined_${i}`, createdAt: new Date(new Date(order.createdAt!).getTime() - 120000), gatewayResponse: { demo: true, error: "card_declined", message: "The first attempt was declined; a later attempt succeeded." } },
        payment,
      ] : [payment];
    });
    counts.payments = (await tx.payment.createMany({ data: payments, skipDuplicates: true })).count;
    await tx.paymentTransaction.createMany({ skipDuplicates: true, data: payments.filter((p) => p.status === "SUCCESS").map((p) => ({
      id: id(`cashflow-${p.id}`), gateway: "LOCAL_DEMO", externalId: p.gatewayTransactionId!,
      kind: p.isSubscription ? "SUBSCRIPTION_INITIAL_CHARGE" : "ONE_OFF_CHARGE", amount: p.amount, currency: p.currency,
      userId: p.userId, orderId: p.orderId, paymentId: p.id, occurredAt: p.updatedAt!,
    })) });
    await tx.userStats.createMany({ skipDuplicates: true, data: userIds.map((userId, i) => {
      const paid = orders.filter((o) => o.userId === userId && o.status === "COMPLETED");
      return { id: id(`stats-${i}`), userId, totalPaidCents: paid.reduce((sum, o) => sum + o.amount, 0), ordersCount: paid.length,
        firstPaidAt: paid.at(-1)?.createdAt ?? null, lastPaidAt: paid[0]?.createdAt ?? null,
        hitPaywallCount: i % 6, hasUsedProTrial: i < 8, proTrialSource: i < 8 ? "local_demo" : null, proTrialConverted: i < 6 };
    }) });
    const subscriptionOrders = orders.filter((o, i) => i % 3 < 2 && i < 12);
    counts.subscriptions = (await tx.userSubscription.createMany({ skipDuplicates: true, data: subscriptionOrders.map((o, i) => {
      const planIndex = o.productId === id("product-0") ? 0 : 1;
      const plan = plans[planIndex]!;
      return { id: id(`subscription-${i}`), userId: o.userId, planId: id(`plan-${planIndex}`), planSnapshot: { id: plan.id!, name: plan.name!, type: plan.type!, interval: plan.interval!, creditsPerPeriod: plan.creditsPerPeriod! },
        status: i === 7 ? "CANCELED" : "ACTIVE", gateway: "LOCAL_DEMO", gatewaySubscriptionId: `demo_subscription_${i}`,
        cancelAtPeriodEnd: i === 6, canceledAt: i >= 6 ? days(-2) : null, endedAt: i === 7 ? days(-1) : null, createdAt: o.createdAt };
    }) })).count;
    await tx.userSubscriptionCycle.createMany({ skipDuplicates: true, data: subscriptionOrders.map((o, i) => ({
      id: id(`cycle-${i}`), subscriptionId: id(`subscription-${i}`), paymentId: id(`payment-${orders.indexOf(o)}`),
      uniqueKey: `demo_cycle_${i}`, type: "REGULAR", status: i === 7 ? "CLOSED" : "ACTIVE", sequenceNumber: 1,
      startsAt: o.createdAt!, expiresAt: i === 7 ? days(-1) : days(o.productId === id("product-1") ? 330 : 15),
      lastCreditGrantAnchor: now,
    })) });

    const promoSpecs = [
      { code: "DEMO-WELCOME", status: "ACTIVE", usageLimit: 100, usedCount: 12, creditsAmount: 500 },
      { code: "DEMO-EXHAUSTED", status: "ACTIVE", usageLimit: 10, usedCount: 10, creditsAmount: 250 },
      { code: "DEMO-EXPIRED", status: "EXPIRED", usageLimit: 100, usedCount: 2, creditsAmount: 100 },
      { code: "DEMO-DRAFT", status: "DRAFT", usageLimit: 0, usedCount: 0, creditsAmount: 1000 },
      { code: "DEMO-PAUSED", status: "DISABLED", usageLimit: 50, usedCount: 0, creditsAmount: 300 },
      { code: "DEMO-PRODUCT", status: "DRAFT", usageLimit: 25, usedCount: 0, creditsAmount: 0 },
    ] as const;
    counts.promoCodes = (await tx.promoCode.createMany({ skipDuplicates: true, data: promoSpecs.map((p, i) => ({
      id: id(`promo-${i}`), ...p, codeType: "USER_PROMOTION", grantType: i === 5 ? "PRODUCT" : "CREDIT",
      productId: i === 5 ? id("product-2") : null, perUserLimit: 1, startsAt: days(-30), expiresAt: i === 2 ? days(-2) : days(30),
      notes: "本地演示记录 / Local demonstration only. Historical credit grants are illustrative; the external credit ledger is not seeded.", createdBy: admin.id,
    })) })).count;
    counts.redemptions = (await tx.promoCodeRedemption.createMany({ skipDuplicates: true, data: promoSpecs.flatMap((p, i) => Array.from({ length: p.usedCount }, (_, j) => ({
      id: id(`redemption-${i}-${j}`), promoCodeId: id(`promo-${i}`), userId: userIds[j]!, creditsGranted: p.creditsAmount,
      redeemedAt: days(-4 - j), ipAddress: `192.0.2.${j + 1}`,
    }))) })).count;

    // Derive balances from the same ledger events used to create commission/payout histories.
    const affiliateOrders = orders.filter((o, i) => o.status === "COMPLETED" && i >= 2 && i < 26 && i % 3 === 1);
    const entries: Prisma.AffiliateLedgerEntryCreateManyInput[] = [];
    const earnings: Prisma.AffiliateEarningCreateManyInput[] = affiliateOrders.map((o, i) => {
      const userIndex = userIds.indexOf(o.userId), partner = userIndex < 14 ? 0 : 1;
      const amount = Math.round(o.amount * 0.3), state = i === 0 ? "PENDING" : i === 1 ? "VOIDED" : "AVAILABLE";
      const base = { accountId: id(`affiliate-account-${partner}`), userId: userIds[partner]!, referenceType: "EARNING" as const, referenceId: id(`earning-${i}`) };
      entries.push({ ...base, id: id(`ledger-create-${i}`), idempotencyKey: `demo_earning_created_${i}`, kind: "EARNING_CREATED", deltaPendingCents: amount, createdAt: o.createdAt });
      if (state !== "PENDING") entries.push({ ...base, id: id(`ledger-settle-${i}`), idempotencyKey: `demo_earning_settled_${i}`, kind: state === "VOIDED" ? "EARNING_VOIDED" : "EARNING_MATURED", deltaPendingCents: -amount, deltaAvailableCents: state === "AVAILABLE" ? amount : 0, createdAt: days(-5) });
      return { id: id(`earning-${i}`), sourceType: "ORDER_PAYMENT", sourceExternalId: `demo_transaction_${orders.indexOf(o)}`,
        affiliateUserId: userIds[partner]!, referredUserId: o.userId, orderId: o.id, paymentId: id(`payment-${orders.indexOf(o)}`), paymentGateway: "LOCAL_DEMO",
        grossAmountCents: o.amount, commissionRateBps: 3000, commissionCents: amount, state, availableAt: state === "PENDING" ? days(20) : days(-5), createdAt: o.createdAt };
    });
    const payoutStatuses = ["REQUESTED", "APPROVED", "REJECTED", "COMPLETED", "FAILED"] as const;
    const payouts: Prisma.AffiliatePayoutRequestCreateManyInput[] = payoutStatuses.map((status, i) => {
      const partner = i < 2 ? 0 : 1, amount = 2500;
      const base = { accountId: id(`affiliate-account-${partner}`), userId: userIds[partner]!, referenceType: "PAYOUT_REQUEST" as const, referenceId: id(`payout-${i}`) };
      entries.push({ ...base, id: id(`ledger-request-${i}`), idempotencyKey: `demo_payout_requested_${i}`, kind: "PAYOUT_REQUESTED", deltaAvailableCents: -amount, deltaLockedCents: amount, createdAt: days(-3) });
      if (status === "COMPLETED" || status === "REJECTED" || status === "FAILED") entries.push({ ...base, id: id(`ledger-resolve-${i}`), idempotencyKey: `demo_payout_resolved_${i}`, kind: status === "COMPLETED" ? "PAYOUT_COMPLETED" : "PAYOUT_RELEASED", deltaLockedCents: -amount, deltaAvailableCents: status === "COMPLETED" ? 0 : amount, createdAt: days(-1) });
      return { id: id(`payout-${i}`), affiliateUserId: userIds[partner]!, type: "CASHOUT_USDT", status, amountCents: amount,
        walletAddress: `DEMO-WALLET-${partner + 1}-NOT-FOR-PAYMENT`, txHash: status === "COMPLETED" ? "demo-transfer-no-chain-transaction" : null,
        adminNote: "本地演示提现记录；不对应真实资金或链上转账。", createdAt: days(-3), updatedAt: days(-1) };
    });
    await tx.affiliateAccount.createMany({ skipDuplicates: true, data: [0, 1].map((i) => {
      const ledger = entries.filter((e) => e.userId === userIds[i]);
      return { id: id(`affiliate-account-${i}`), userId: userIds[i]!, pendingCents: ledger.reduce((s, e) => s + (e.deltaPendingCents ?? 0), 0),
        availableCents: ledger.reduce((s, e) => s + (e.deltaAvailableCents ?? 0), 0), lockedCents: ledger.reduce((s, e) => s + (e.deltaLockedCents ?? 0), 0), version: ledger.length };
    }) });
    counts.commissions = (await tx.affiliateEarning.createMany({ data: earnings, skipDuplicates: true })).count;
    counts.payouts = (await tx.affiliatePayoutRequest.createMany({ data: payouts, skipDuplicates: true })).count;
    await tx.affiliateLedgerEntry.createMany({ data: entries, skipDuplicates: true });

    const scenes = [
      { key: "demo_welcome", name: "Demo · 欢迎与入门", triggerType: "EVENT" as const },
      { key: "demo_renewal", name: "Demo · Subscription renewal", triggerType: "SCHEDULED" as const },
      { key: "demo_product_update", name: "Demo · 产品更新长文通知", triggerType: "MANUAL" as const },
    ];
    counts.scenes = (await tx.touchScene.createMany({ skipDuplicates: true, data: scenes.map((s) => ({ id: id(s.key), ...s, channel: "EMAIL", isActive: false, description: "本地演示场景，默认停用；用于查看模板与历史记录。" })) })).count;
    const templates = scenes.flatMap((s, i) => ["en", "zh"].map((locale) => ({
      id: id(`template-${i}-${locale}`), sceneKey: s.key, locale, version: "default", isDefault: true, isActive: false,
      subject: locale === "zh" ? "{{name}}，您的账户更新" : "{{name}}, an update about your account",
      bodyText: locale === "zh" ? "您好 {{name}}，\n\n您的演示账户已准备就绪。续费时间：{{periodEndAtIso}}。\n管理账户：{{manageUrl}}\n\n此邮件仅用于本地界面展示。" : "Hello {{name}},\n\nYour demonstration account is ready. Renewal date: {{periodEndAtIso}}.\nManage your account: {{manageUrl}}\n\nThis message is for local UI review only.",
      bodyHtml: i === 2 ? null : `<html><body style="font-family:system-ui;padding:32px;line-height:1.7"><h1>${locale === "zh" ? "账户更新" : "Account update"}</h1><p>Hello {{name}},</p><p>{{periodEndAtIso}}</p><p><a href="{{manageUrl}}">${locale === "zh" ? "管理账户" : "Manage account"}</a></p><hr/><p>Local Harness demonstration</p></body></html>`,
    })));
    counts.templates = (await tx.touchTemplate.createMany({ data: templates, skipDuplicates: true })).count;
    const scheduleStatuses = ["SENT", "FAILED", "CANCELLED", "SUPERSEDED"] as const;
    const schedules: Prisma.TouchScheduleCreateManyInput[] = Array.from({ length: 28 }, (_, i) => ({
      id: id(`schedule-${i}`), userId: userIds[i]!, channel: "EMAIL", sceneKey: scenes[i % 3]!.key,
      referenceType: "LOCAL_DEMO", referenceId: id(`user-${i}`), dedupeKey: `demo_schedule_${i}`,
      timezone: i % 2 ? "America/New_York" : "Asia/Shanghai", scheduledAt: days(-i - 1), nextAttemptAt: days(-i - 1),
      status: scheduleStatuses[i % 4]!, attemptCount: i % 4 < 2 ? 2 : 0, maxAttempts: 2,
      sentAt: i % 4 === 0 ? days(-i - 1) : null, cancelledAt: i % 4 === 2 ? days(-i - 1) : null,
      supersededAt: i % 4 === 3 ? days(-i - 1) : null, lastError: i % 4 === 1 ? "Demo delivery failed: recipient mailbox unavailable." : null,
      payload: { demo: true, name: names[i], periodEndAtIso: days(15).toISOString(), manageUrl: "http://localhost:3003/" }, createdAt: days(-i - 2),
    }));
    counts.touchSchedules = (await tx.touchSchedule.createMany({ data: schedules, skipDuplicates: true })).count;
    counts.touchRecords = (await tx.touchRecord.createMany({ skipDuplicates: true, data: schedules.flatMap((s, i) => i % 4 < 2 ? [1, 2].map((attempt) => ({
      id: id(`touch-record-${i}-${attempt}`), scheduleId: s.id!, templateId: id(`template-${i % 3}-${i % 2 ? "en" : "zh"}`), attemptNumber: attempt,
      provider: "local_demo", providerMessageId: `demo-message-${i}-${attempt}`, toEmail: emails[i]!, subject: `Demo · ${names[i]}，账户更新`,
      status: attempt === 1 || i % 4 === 1 ? "FAILED" as const : "DELIVERED" as const,
      error: attempt === 1 ? "Demo provider timeout." : i % 4 === 1 ? "Demo recipient mailbox unavailable." : null,
      meta: { demo: true, text: `您好 ${names[i]}，这是本地演示记录。`, html: `<p>您好 ${names[i]}，这是本地演示记录。</p>` },
      occurredAt: new Date(new Date(s.scheduledAt).getTime() + attempt * 60000),
    })) : []) })).count;

    const subjects = ["升级后套餐权益没有显示", "Could you explain the annual invoice and renewal date?", "如何修改团队账单信息？", "Resolved: receipt downloaded successfully", "跨时区使用与账户设置：一封包含较长背景说明的客户邮件", "Question about account access"];
    const statuses = ["OPEN", "NEEDS_APPROVAL", "WAITING", "SOLVED"] as const;
    counts.tickets = (await tx.supportTicket.createMany({ skipDuplicates: true, data: Array.from({ length: 24 }, (_, i) => ({
      id: id(`ticket-${i}`), userId: userIds[i]!, contact: emails[i]!, channel: "email", status: statuses[i % 4]!, assignedTo: "AGENT",
      subject: subjects[i % subjects.length]!, summary: "Local Admin demonstration conversation / 本地演示邮件线程。", priority: i % 3,
      createdAt: days(-i - 2), updatedAt: days(-i / 10), resolvedAt: i % 4 === 3 ? days(-i / 10) : null,
    })) })).count;
    counts.messages = (await tx.supportTimeline.createMany({ skipDuplicates: true, data: Array.from({ length: 24 }, (_, i) => Array.from({ length: i === 0 ? 26 : 3 }, (_, j) => ({
      id: id(`message-${i}-${j}`), ticketId: id(`ticket-${i}`), actor: j % 2 ? "AGENT" as const : "USER" as const,
      actorId: j % 2 ? admin.id : userIds[i], type: "MESSAGE" as const,
      content: j % 2 ? "您好，已收到您的说明。请确认问题发生时间和订单编号，我们会继续核对。\n\nThanks for the details. We are reviewing the account history and will follow up here." : `您好，我在使用账户时遇到一个问题，希望帮忙查看。\n\n订单参考：${id(`order-${i}`)}\n\nI upgraded my plan and would like to understand the billing period, account access, and which settings I should review.\n\n${j === 0 ? "补充说明：我在不同设备和时区之间切换，页面显示的信息需要保持一致。" : `Follow-up ${j + 1}: here is the additional context.`}`,
      metadata: { demo: true, messageId: `<demo-${i}-${j}@example.test>` }, createdAt: new Date(days(-i - 2).getTime() + j * 60000),
    }))).flat() })).count;
    // Historical outcomes only: no PENDING/SENDING rows that a worker could dispatch.
    counts.replies = (await tx.supportReply.createMany({ skipDuplicates: true, data: [0, 1, 2, 3].map((i) => ({
      id: id(`reply-${i}`), ticketId: id(`ticket-${i}`), actor: "AGENT", actorId: admin.id,
      body: "这是一条供界面观察的历史回复。This local sample has not been sent to any mailbox.",
      status: i % 2 ? "CANCELED" : "UNKNOWN", createdAt: days(-i / 10),
    })) })).count;
    return counts;
  }, { timeout: 60000 });
  console.log("Admin demo data inserted:", JSON.stringify(inserted));
  console.log("Open http://localhost:3003/admin/users — search demo.user01@example.test for a populated detail page.");
  console.log("Credit balances use the external Velobase ledger and are not included in this database seed.");
}

try {
  await main();
} finally {
  await db.$disconnect();
}
