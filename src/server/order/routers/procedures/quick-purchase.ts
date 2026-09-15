import { z } from "zod";
import { protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { SALES_PAUSED } from "@/config/decommission";
import { chargeWithSavedCard } from "@/server/order/services/stripe/charge-saved-card";
import { db } from "@/server/db";
import { paymentRecords } from "@/modules/payments/server/service";
import { createOrder } from "@/server/order/services/create-order";
import { createPayment } from "@/server/order/services/create-payment";
import { processFulfillmentByPayment } from "@/server/fulfillment/manager";
import { logger } from "@/server/shared/telemetry/logger";
import { safeTrack } from "@/analytics/server";
import { BILLING_EVENTS } from "@/analytics/events/billing";

const quickPurchaseInput = z.object({
  productId: z.string(),
  metadata: z.record(z.string()).optional(),
});

/**
 * 一键购买：使用用户已保存的卡直接扣款
 *
 * 流程：
 * 1. 验证产品存在且是一次性购买产品
 * 2. 检查用户是否有保存的卡
 * 3. 创建订单和支付记录
 * 4. 使用保存的卡进行后台扣款
 * 5. 履约（发放积分/权益）
 *
 * @throws NO_SAVED_CARD - 用户没有保存的卡，需要走 Checkout 流程
 * @throws PAYMENT_FAILED - 扣款失败
 */
export const quickPurchaseProcedure = protectedProcedure
  .input(quickPurchaseInput)
  .mutation(async ({ ctx, input }) => {
    if (SALES_PAUSED) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "SALES_PAUSED",
      });
    }

    const userId = ctx.session.user.id;
    const { productId, metadata } = input;

    // 1. 获取产品信息
    const product = await db.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Product not found",
      });
    }

    // 只支持一次性购买产品（ONE_TIME_ENTITLEMENT）和积分包（CREDITS_PACKAGE）
    // 不支持订阅产品
    if (product.type === "SUBSCRIPTION") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Quick purchase does not support subscriptions",
      });
    }

    logger.info(
      {
        userId,
        productId,
        productName: product.name,
        amount: product.price,
      },
      "Starting quick purchase",
    );

    // 2. 创建订单
    const order = await createOrder({
      userId,
      productId,
      type: "NEW_PURCHASE",
    });

    // 3. 创建支付记录
    const payment = await createPayment({
      orderId: order.id,
      userId,
      amount: order.amount,
      currency: order.currency,
      isSubscription: false,
    });

    let capturedPaymentIntentId: string | undefined;
    try {
      // 4. 使用保存的卡扣款
      const chargeResult = await chargeWithSavedCard({
        userId,
        amount: order.amount,
        currency: order.currency,
        productId,
        metadata: {
          ...metadata,
          orderId: order.id,
          paymentId: payment.id,
        },
      });
      capturedPaymentIntentId = chargeResult.paymentIntentId;

      // 5. 更新支付状态
      const recorded = await paymentRecords.recordVerifiedState({
        paymentId: payment.id,
        gateway: "STRIPE",
        status: "SUCCEEDED",
        gatewayTransactionId: chargeResult.paymentIntentId,
      });
      if (!recorded.applied)
        return { success: true, orderId: order.id, paymentId: payment.id };
      await processFulfillmentByPayment(recorded.payment);

      // 更新订单为已履约
      await db.order.update({
        where: { id: order.id },
        data: { status: "FULFILLED" },
      });

      // 标记用户已购买
      await db.user.update({
        where: { id: userId },
        data: { hasPurchased: true },
      });

      // 8. 埋点（服务端使用 safeTrack，不阻塞业务）
      await safeTrack(BILLING_EVENTS.CREDITS_PURCHASE_SUCCESS, userId, {
        package_id: productId,
        credits: 0,
        price: product.price,
        product_type: product.type,
        source: "quick_purchase",
      });

      logger.info(
        {
          userId,
          orderId: order.id,
          paymentId: payment.id,
          paymentIntentId: chargeResult.paymentIntentId,
        },
        "Quick purchase succeeded",
      );

      return {
        success: true,
        orderId: order.id,
        paymentId: payment.id,
      };
    } catch (err) {
      const error = err as Error;
      if (capturedPaymentIntentId) {
        // A fulfillment/storage failure cannot turn a captured charge into a failed payment or a second charge.
        await db.payment
          .updateMany({
            where: { id: payment.id, gatewayTransactionId: null },
            data: { gatewayTransactionId: capturedPaymentIntentId },
          })
          .catch(() => undefined);
        logger.error(
          { error, paymentId: payment.id, orderId: order.id },
          "Captured quick purchase needs confirmation/fulfillment retry",
        );
        return { success: true, orderId: order.id, paymentId: payment.id };
      }

      // 更新支付状态为失败
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          extra: {
            error: error.message,
            source: "quick_purchase",
          },
        },
      });

      // 更新订单状态
      await db.order.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
        },
      });

      if (error.message === "NO_SAVED_CARD") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "NO_SAVED_CARD",
        });
      }

      if (error.message === "REQUIRES_ACTION") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "REQUIRES_ACTION",
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "PAYMENT_FAILED",
      });
    }
  });
