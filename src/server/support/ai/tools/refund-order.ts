/**
 * 退款订单工具
 * 
 * 用于退还一次性购买（如积分包）的款项
 */

import { db } from "@/server/db";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/server/order/providers/stripe";
import { appEvents } from "@/server/events/bus";

export interface RefundOrderOptions {
  /** 指定退款的订单 ID，不传则退最近一笔成功的订单 */
  orderId?: string;
  /** 退款金额（分），不传则全额退款 */
  amount?: number;
  /** 退款原因 */
  reason?: string;
}

export interface RefundOrderResult {
  success: boolean;
  message: string;
  orderId?: string;
  refundAmount?: number;
  refundCurrency?: string;
  error?: string;
}

/**
 * 退款订单
 * 
 * @param userId - 用户 ID
 * @param options - 退款选项
 * @returns 退款结果
 */
export async function refundOrder(
  userId: string,
  options: RefundOrderOptions = {}
): Promise<RefundOrderResult> {
  const { orderId, amount, reason = "requested_by_customer" } = options;
  const stripe = getStripeClient();

  try {
    // 1. 查找订单和支付记录
    let payment;

    if (orderId) {
      // 指定订单 ID
      payment = await db.payment.findFirst({
        where: {
          order: { id: orderId },
          userId,
          status: "SUCCEEDED",
        },
        include: { order: true },
      });

      if (!payment) {
        return {
          success: false,
          message: `Order ${orderId} not found or not refundable`,
          error: "ORDER_NOT_FOUND",
        };
      }
    } else {
      // 查找最近一笔成功的支付（非订阅类型）
      payment = await db.payment.findFirst({
        where: {
          userId,
          status: "SUCCEEDED",
          order: {
            type: { not: "SUBSCRIPTION" }, // 排除订阅类型，订阅用 cancel_subscription
          },
        },
        include: { order: true },
        orderBy: { createdAt: "desc" },
      });

      if (!payment) {
        return {
          success: false,
          message: "No refundable payment found",
          error: "NO_REFUNDABLE_PAYMENT",
        };
      }
    }

    if (!payment.gatewayTransactionId) {
      return {
        success: false,
        message: "Payment has no gateway transaction ID",
        error: "NO_GATEWAY_TRANSACTION_ID",
      };
    }

    // 2. 计算退款金额
    const refundAmount = amount ?? payment.amount; // 不传则全额退款
    
    if (refundAmount > payment.amount) {
      return {
        success: false,
        message: `Refund amount (${refundAmount}) exceeds payment amount (${payment.amount})`,
        error: "REFUND_AMOUNT_EXCEEDS_PAYMENT",
      };
    }

    // 3. 在 Stripe 创建退款
    const refund = await stripe.refunds.create({
      payment_intent: payment.gatewayTransactionId,
      amount: refundAmount,
      reason: reason as "duplicate" | "fraudulent" | "requested_by_customer" | undefined,
      metadata: {
        source: "ai_support_tool",
        userId,
        orderId: payment.orderId,
      },
    });

    // 4. 更新本地数据库
    const isFullRefund = refundAmount === payment.amount;

    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: isFullRefund ? "REFUNDED" : "SUCCEEDED", // 部分退款保持 SUCCEEDED
          extra: {
            ...(payment.extra as object ?? {}),
            refund: {
              id: refund.id,
              amount: refundAmount,
              status: refund.status,
              createdAt: new Date().toISOString(),
            },
          },
        },
      });

      if (isFullRefund) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: "REFUNDED" },
        });
      }
    });

    await appEvents.emit("payment:refunded", {
      paymentId: payment.id, gateway: payment.paymentGateway, eventId: `refund:${refund.id}`,
    });

    logger.info(
      {
        userId,
        paymentId: payment.id,
        orderId: payment.orderId,
        refundAmount,
        refundId: refund.id,
        isFullRefund,
      },
      "Order refunded successfully"
    );

    return {
      success: true,
      message: isFullRefund
        ? `Full refund of ${(refundAmount / 100).toFixed(2)} ${payment.currency.toUpperCase()} processed`
        : `Partial refund of ${(refundAmount / 100).toFixed(2)} ${payment.currency.toUpperCase()} processed`,
      orderId: payment.orderId,
      refundAmount,
      refundCurrency: payment.currency,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, userId, orderId, amount }, "Failed to refund order");

    return {
      success: false,
      message: "Failed to process refund",
      error: errorMessage,
    };
  }
}

