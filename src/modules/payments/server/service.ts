import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import {
  createPaymentRecords,
  PaymentsError,
  type PaymentRepository,
  type PaymentTransaction,
} from "@velobase/payments";
import { db } from "@/server/db";
import { isFeatureEnabled } from "@/server/features/state";

const orderInclude = {
  product: true,
  payments: true,
  user: { select: { id: true, email: true, name: true } },
} as const;
const paymentInclude = {
  order: true,
  user: { select: { id: true, email: true, name: true } },
} as const;
type Order = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type Payment = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;
const getOrder = (id: string) =>
  db.order.findUnique({ where: { id }, include: orderInclude });
const getPayment = (id: string) =>
  db.payment.findUnique({ where: { id }, include: paymentInclude });

function transaction(
  tx: Prisma.TransactionClient,
): PaymentTransaction<Order, Payment> {
  return {
    getOrder: (id) =>
      tx.order.findUnique({ where: { id }, include: orderInclude }),
    getPayment: (id) =>
      tx.payment.findUnique({ where: { id }, include: paymentInclude }),
    findReusableOrder: (draft, now) =>
      tx.order.findFirst({
        where: {
          userId: draft.userId,
          productId: draft.productId,
          type: draft.type,
          amount: draft.amount,
          quantity: draft.quantity,
          currency: { equals: draft.currency, mode: "insensitive" },
          productSnapshot: {
            equals: draft.productSnapshot as Prisma.InputJsonValue,
          },
          status: "PENDING",
          expiresAt: { gt: now },
          deletedAt: null,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: orderInclude,
      }),
    createOrder: (draft, expiresAt) =>
      tx.order.create({
        data: {
          ...draft,
          productSnapshot: draft.productSnapshot as Prisma.InputJsonValue,
          status: "PENDING",
          expiresAt,
        },
        include: orderInclude,
      }),
    findReusablePayment: (draft, now) =>
      tx.payment.findFirst({
        where: {
          orderId: draft.orderId,
          userId: draft.userId,
          amount: draft.amount,
          currency: { equals: draft.currency, mode: "insensitive" },
          paymentGateway: draft.paymentGateway,
          isSubscription: draft.isSubscription,
          status: "PENDING",
          expiresAt: { gt: now },
          deletedAt: null,
          ...(draft.reuseKey
            ? {
                extra: {
                  path: ["requestedCryptoCurrency"],
                  equals: draft.reuseKey,
                },
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: paymentInclude,
      }),
    createPayment: ({ reuseKey: _reuseKey, extra, ...draft }, expiresAt) =>
      tx.payment.create({
        data: {
          ...draft,
          extra: extra ? (extra as Prisma.InputJsonValue) : undefined,
          status: "PENDING",
          expiresAt,
        },
        include: paymentInclude,
      }),
    hasPaymentAttempts: async (orderId) =>
      (await tx.payment.count({ where: { orderId } })) > 0,
    hasSettledPayment: async (orderId) =>
      (await tx.payment.count({
        where: {
          orderId,
          status: { in: ["SUCCEEDED", "SUCCESS", "REFUNDED"] },
        },
      })) > 0,
    async recordVerifiedState(payment, state) {
      const changed = await tx.payment.updateMany({
        where: {
          id: payment.id,
          updatedAt: payment.updatedAt,
          status: payment.status,
          gatewayTransactionId: payment.gatewayTransactionId,
          gatewaySubscriptionId: payment.gatewaySubscriptionId,
        },
        data: {
          status: state.status,
          gatewayTransactionId:
            payment.gatewayTransactionId ?? state.gatewayTransactionId,
          gatewaySubscriptionId:
            payment.gatewaySubscriptionId ?? state.gatewaySubscriptionId,
          ...(state.rawData !== undefined
            ? {
                gatewayResponse:
                  state.rawData === null
                    ? Prisma.JsonNull
                    : (state.rawData as Prisma.InputJsonValue),
              }
            : {}),
          updatedAt: new Date(
            Math.max(Date.now(), payment.updatedAt.getTime() + 1),
          ),
        },
      });
      return changed.count === 1
        ? tx.payment.findUnique({
            where: { id: payment.id },
            include: paymentInclude,
          })
        : null;
    },
    async cancelUnattemptedOrder(order) {
      const result = await tx.order.updateMany({
        where: {
          id: order.id,
          status: "PENDING",
          deletedAt: null,
          payments: { none: {} },
        },
        data: { status: "CANCELLED" },
      });
      return result.count === 1
        ? tx.order.findUnique({
            where: { id: order.id },
            include: orderInclude,
          })
        : null;
    },
  };
}
const repository: PaymentRepository<Order, Payment> = {
  getOrder,
  getPayment,
  transaction: (scope, work) =>
    db.$transaction(async (tx) => {
      const key = `harness-payments:${scope.kind}:${scope.id}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      return work(transaction(tx));
    }),
  async listOrders(input) {
    const rows = await db.order.findMany({
      where: { userId: input.userId, status: input.status, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: orderInclude,
    });
    return {
      items: rows.slice(0, input.limit),
      nextCursor:
        rows.length > input.limit ? rows[input.limit - 1]?.id : undefined,
    };
  },
  async listPayments(input) {
    const rows = await db.payment.findMany({
      where: {
        userId: input.userId,
        orderId: input.orderId,
        status: input.status,
        deletedAt: null,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: paymentInclude,
    });
    return {
      items: rows.slice(0, input.limit),
      nextCursor:
        rows.length > input.limit ? rows[input.limit - 1]?.id : undefined,
    };
  },
};
export const paymentRecords = createPaymentRecords({
  repository,
  isEnabled: () => isFeatureEnabled("payments"),
});
export async function paymentOperation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PaymentsError)
      throw new TRPCError({
        code: error.code === "UNAVAILABLE" ? "FORBIDDEN" : error.code,
        message: error.message,
        cause: error,
      });
    if (error instanceof z.ZodError)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid payment input",
        cause: error,
      });
    throw error;
  }
}
