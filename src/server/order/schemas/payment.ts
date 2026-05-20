import { z } from "zod";

export const createCheckoutSessionSchema = z.object({
  productId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  gateway: z.enum(["STRIPE", "NOWPAYMENTS", "LEMONSQUEEZY"]).optional(),
  cryptoCurrency: z.string().optional(),
  quantity: z.number().int().min(1).optional(),
  // 业务元信息（例如下载付费墙的 videoId/source），仅存入 payment.extra，在履约阶段使用
  metadata: z.record(z.unknown()).optional(),
});

export const getPaymentSchema = z.object({
  paymentId: z.string().min(1),
});

export const listPaymentsSchema = z.object({
  orderId: z.string().min(1).optional(),
  status: z
    .enum(["PENDING", "SUCCEEDED", "FAILED", "EXPIRED", "REFUNDED"])
    .optional(),
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().min(0).default(0),
});

export const refundPaymentSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.number().int().positive().optional(),
  reason: z.string().optional(),
});

export const confirmPaymentSchema = z.object({
  paymentId: z.string().min(1),
});
