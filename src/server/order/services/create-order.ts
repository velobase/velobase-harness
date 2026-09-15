import { db } from "@/server/db";
import { requireFeature } from "@/server/features/state";
import {
  paymentRecords,
  paymentOperation,
} from "@/modules/payments/server/service";
import type { OrderType } from "../types";
import { checkSubscriptionEligibility } from "./check-subscription-eligibility";
import { logger } from "@/server/shared/telemetry/logger";
import { buildProductSnapshot } from "./product-snapshot";

interface CreateOrderParams {
  userId: string;
  productId: string;
  type?: OrderType;
  amount?: number;
  quantity?: number;
  currency?: string;
}

/** This host supplies commerce eligibility and the trusted product snapshot to the independent order service. */
export async function createOrder({
  userId,
  productId,
  type = "NEW_PURCHASE",
  amount,
  quantity = 1,
  currency,
}: CreateOrderParams) {
  await requireFeature("products");
  const product = await db.product.findUnique({
    where: { id: productId, deletedAt: null },
    include: { productSubscription: { include: { plan: true } } },
  });
  if (!product) throw new Error("Product not found");
  if (
    product.status !== "ACTIVE" ||
    !product.isAvailable ||
    product.type === "UNDEFINED"
  )
    throw new Error("Product is not available");
  if (product.type === "SUBSCRIPTION") {
    await requireFeature("subscriptions");
    if (type !== "UPGRADE" && type !== "DOWNGRADE" && type !== "RENEWAL")
      await checkSubscriptionEligibility(userId);
  }
  if (product.type === "CREDITS_PACKAGE") await requireFeature("credits");

  // Amount/currency overrides are calculated by the host's checkout; never take them from browser input.
  const order = await paymentOperation(() =>
    paymentRecords.createOrder({
      userId,
      productId,
      type,
      amount: amount ?? product.price,
      currency: (currency ?? product.currency ?? "usd").toLowerCase(),
      quantity,
      productSnapshot: buildProductSnapshot(product),
    }),
  );
  logger.info(
    {
      userId,
      productId,
      orderId: order.id,
      orderType: order.type,
      amount: order.amount,
      currency: order.currency,
      action: "order_prepared",
    },
    "Order prepared",
  );
  return order;
}
