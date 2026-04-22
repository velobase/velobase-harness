import type { FrameworkModule } from "@/server/modules/registry";
import { createLogger } from "@/lib/logger";

const log = createLogger("module:lark");

export const larkModule: FrameworkModule = {
  name: "lark",
  enabled: true,

  registerEventHandlers(bus) {
    bus.on("payment:succeeded", async ({ paymentId }) => {
      try {
        const { sendOrderPaymentNotificationByPaymentId } = await import(
          "@/server/order/services/send-order-payment-notification"
        );
        await sendOrderPaymentNotificationByPaymentId(paymentId, { source: "webhook" });
      } catch (error) {
        log.warn({ error, paymentId }, "Lark payment notification failed");
      }
    });

    bus.on("payment:failed", async ({ paymentId, orderId, userId, gateway, failureReason }) => {
      try {
        const { asyncSendPaymentNotification } = await import("@/lib/lark");
        const { db } = await import("@/server/db");
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true, utmSource: true, utmMedium: true, utmCampaign: true },
        });
        const order = await db.order.findUnique({
          where: { id: orderId },
          include: { product: true },
        });

        asyncSendPaymentNotification({
          userName: user?.name ?? user?.email ?? userId,
          userEmail: user?.email ?? undefined,
          amountCents: order?.amount ?? 0,
          currency: order?.currency ?? "usd",
          productName: order?.product?.name ?? "Unknown",
          orderId,
          paymentId,
          gateway: gateway as "stripe" | "nowpayments" | "other",
          status: "failed",
          failureReason,
          isTest: process.env.NODE_ENV !== "production",
          utm: {
            source: user?.utmSource ?? undefined,
            medium: user?.utmMedium ?? undefined,
            campaign: user?.utmCampaign ?? undefined,
          },
          originalAmountCents: order?.product?.originalPrice ?? undefined,
        });
      } catch (error) {
        log.warn({ error, paymentId }, "Lark payment failure notification failed");
      }
    });

    bus.on("fraud:efw", async ({ warning }) => {
      try {
        const { asyncSendBackendAlert } = await import("@/lib/lark/notifications");
        asyncSendBackendAlert({
          title: "Stripe Early Fraud Warning",
          severity: "critical",
          source: "webhook",
          metadata: { warning },
        });
      } catch (error) {
        log.warn({ error }, "Lark fraud alert failed");
      }
    });
  },

  async onInit() {
    try {
      const { onMessage, onCardAction, parseTextContent } = await import(
        "@/lib/lark/event-handler"
      );
      const { getLarkBot, LARK_CHAT_IDS } = await import("@/lib/lark");
      const { generateHourlyReport } = await import(
        "@/workers/processors/conversion-alert/generate-report"
      );
      const { buildMetricsCard } = await import(
        "@/workers/processors/conversion-alert/build-card"
      );
      const { handleSupportCardAction } = await import(
        "@/server/support/handlers/card-action"
      );

      type MessageEventData = Parameters<Parameters<typeof onMessage>[0]>[0];
      type CardActionEventData = Parameters<
        Parameters<typeof onCardAction>[0]
      >[0];

      onMessage(async (data: MessageEventData) => {
        const text = parseTextContent(data.message.content);
        const chatId = data.message.chat_id;

        log.info(
          { chatId, senderId: data.sender.sender_id.open_id, text },
          "Received message",
        );

        if (chatId === LARK_CHAT_IDS.CONVERSION_ALERT) {
          try {
            log.info("Generating hourly report on demand");
            const report = await generateHourlyReport({ isDaily: false });
            const card = buildMetricsCard(report, { isDaily: false });
            const bot = getLarkBot();
            await bot.sendCard(chatId, card);
            log.info("Hourly report sent on demand");
          } catch (error) {
            log.error({ error }, "Failed to send hourly report on demand");
          }
        }

        if (chatId === LARK_CHAT_IDS.CONVERSION_ALERT_DAILY) {
          try {
            log.info("Generating daily report on demand");
            const report = await generateHourlyReport({ isDaily: true });
            const card = buildMetricsCard(report, { isDaily: true });
            const bot = getLarkBot();
            await bot.sendCard(chatId, card);
            log.info("Daily report sent on demand");
          } catch (error) {
            log.error({ error }, "Failed to send daily report on demand");
          }
        }
      });

      onCardAction(async (data: CardActionEventData) => {
        const actionValue = data.action.value;

        log.info({ actionValue }, "Processing card action");

        if (
          actionValue &&
          typeof actionValue === "object" &&
          "ticketId" in actionValue
        ) {
          return handleSupportCardAction(data);
        }

        log.warn({ actionValue }, "Unknown card action");
        return undefined;
      });

      log.info("Lark event handlers registered");
    } catch (error) {
      log.warn(
        { error },
        "Lark handlers not registered (missing config or modules)",
      );
    }
  },
};
