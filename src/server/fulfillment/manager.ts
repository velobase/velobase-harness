import { db } from "@/server/db";
import type { Payment } from "@prisma/client";
import { logger } from "@/server/shared/telemetry/logger";
import type { Fulfiller } from "./types";
import { creditsFulfiller } from "./providers/credits";
import { subscriptionFulfiller } from "./providers/subscription";

const fulfillers: Fulfiller[] = [creditsFulfiller, subscriptionFulfiller];

export async function processFulfillmentByPayment(payment: Payment) {
  if (!payment.orderId) return;

  // 重新从数据库读取最新 Payment，确保补齐的 gatewaySubscriptionId 等字段可用于履约
  const freshPayment = await db.payment.findUnique({
    where: { id: payment.id },
  });
  if (!freshPayment) {
    throw new Error("Payment not found for fulfillment");
  }
  if (freshPayment.status !== "SUCCEEDED" && freshPayment.status !== "SUCCESS")
    throw new Error("Payment has not succeeded");

  const order = await db.order.findUnique({
    where: { id: freshPayment.orderId },
  });
  if (!order) throw new Error("Order not found for fulfillment");

  const product = await db.product.findUnique({
    where: { id: order.productId },
  });
  if (!product) throw new Error("Product not found for fulfillment");

  const ctx = { order, product, payment: freshPayment };

  const snapshot = order.productSnapshot;
  const purchasedSubscription =
    snapshot &&
    typeof snapshot === "object" &&
    !Array.isArray(snapshot) &&
    snapshot.type === "SUBSCRIPTION";
  const fulfiller = purchasedSubscription
    ? subscriptionFulfiller
    : fulfillers.find((f) => f.canHandle(product));
  if (!fulfiller)
    throw new Error(`No fulfiller for product type: ${product.type}`);

  logger.info(
    {
      orderId: order.id,
      productId: product.id,
      fulfiller: fulfiller.getName(),
    },
    "fulfillment start",
  );
  await fulfiller.fulfill(ctx);
  logger.info(
    {
      orderId: order.id,
      productId: product.id,
      fulfiller: fulfiller.getName(),
    },
    "fulfillment done",
  );
}
