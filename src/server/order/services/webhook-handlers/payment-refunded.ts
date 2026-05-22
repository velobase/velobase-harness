import { db } from "@/server/db";
import type { Payment, Prisma } from "@prisma/client";
import { logger } from "@/server/shared/telemetry/logger";
import type { WebhookEvent } from "../../providers/types";

export async function onPaymentRefunded(event: WebhookEvent, payment: Payment, _adapterName: string) {
  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: "REFUNDED",
      gatewayResponse: event.raw as Prisma.JsonObject,
    },
  });

  logger.info({ paymentId: payment.id, transactionId: event.transactionId }, "Payment marked as REFUNDED");

  return { status: "refunded" };
}
