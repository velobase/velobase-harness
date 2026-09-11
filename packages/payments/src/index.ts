import { z } from "zod";

export const paymentsFeature = {
  id: "payments",
  category: "business",
  dependencies: [],
  defaultEnabled: false,
  href: "/admin/orders",
  connection: "payment",
} as const;
const identifier = z.string().min(1).max(256);
export const moneySchema = z.number().int().min(0).max(2_147_483_647);
export const paymentCurrencySchema = z
  .string()
  .regex(/^[a-zA-Z]{3}$/)
  .transform((value) => value.toLowerCase());
export const gatewaySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .transform((value) => value.toUpperCase());
export const orderTypeSchema = z.enum([
  "NEW_PURCHASE",
  "RENEWAL",
  "UPGRADE",
  "DOWNGRADE",
  "PROMO_GRANT",
]);
export const orderStatusSchema = z.enum([
  "PENDING",
  "FULFILLED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
]);
export const paymentStatusSchema = z.enum([
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "EXPIRED",
  "REFUNDED",
  "REQUIRES_ACTION",
]);
export type OrderType = z.infer<typeof orderTypeSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export const orderDraftSchema = z.object({
  userId: identifier,
  productId: identifier,
  type: orderTypeSchema.default("NEW_PURCHASE"),
  amount: moneySchema,
  currency: paymentCurrencySchema,
  quantity: z.number().int().min(1).max(2_147_483_647).default(1),
  productSnapshot: z.record(z.unknown()),
});
export const paymentDraftSchema = z.object({
  userId: identifier,
  orderId: identifier,
  amount: moneySchema,
  currency: paymentCurrencySchema,
  paymentGateway: gatewaySchema,
  isSubscription: z.boolean().default(false),
  extra: z.record(z.unknown()).optional(),
  reuseKey: z.string().max(256).optional(),
});
export const paymentPageSchema = z.object({
  cursor: identifier.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export type OrderDraft = z.output<typeof orderDraftSchema>;
export type PaymentDraft = z.output<typeof paymentDraftSchema>;
export type PageInput = z.output<typeof paymentPageSchema>;
export const verifiedPaymentStateSchema = z.object({
  paymentId: identifier,
  gateway: gatewaySchema,
  status: paymentStatusSchema,
  gatewayTransactionId: identifier.optional(),
  gatewaySubscriptionId: identifier.optional(),
  rawData: z.unknown().optional(),
});
export type VerifiedPaymentState = z.output<typeof verifiedPaymentStateSchema>;
export interface OrderRecord {
  id: string;
  userId: string;
  productId: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  quantity: number;
  expiresAt: Date;
  deletedAt: Date | null;
}
export interface PaymentRecord {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  paymentGateway: string;
  status: string;
  isSubscription: boolean;
  expiresAt: Date;
  deletedAt: Date | null;
}
export interface PaymentTransaction<
  O extends OrderRecord,
  P extends PaymentRecord,
> {
  getOrder(id: string): Promise<O | null>;
  getPayment(id: string): Promise<P | null>;
  findReusableOrder(draft: OrderDraft, now: Date): Promise<O | null>;
  createOrder(draft: OrderDraft, expiresAt: Date): Promise<O>;
  /** Include amount, currency, gateway, subscription mode and opaque reuseKey in the lookup. */
  findReusablePayment(draft: PaymentDraft, now: Date): Promise<P | null>;
  createPayment(draft: PaymentDraft, expiresAt: Date): Promise<P>;
  /** Local cancellation is allowed only before a payment attempt exists. Never cancel an external session here. */
  hasPaymentAttempts(orderId: string): Promise<boolean>;
  hasSettledPayment(orderId: string): Promise<boolean>;
  /** Compare the persisted version/status, preserve existing provider IDs and atomically write evidence. */
  recordVerifiedState(
    payment: P,
    state: VerifiedPaymentState,
  ): Promise<P | null>;
  cancelUnattemptedOrder(order: O): Promise<O | null>;
}
export interface PaymentRepository<
  O extends OrderRecord,
  P extends PaymentRecord,
> {
  /** Serialize each scope for the transaction. No provider/network call belongs inside this callback. */
  transaction<T>(
    scope: { kind: "customer" | "order"; id: string },
    work: (tx: PaymentTransaction<O, P>) => Promise<T>,
  ): Promise<T>;
  getOrder(id: string): Promise<O | null>;
  getPayment(id: string): Promise<P | null>;
  listOrders(
    input: PageInput & { userId?: string; status?: OrderStatus },
  ): Promise<{ items: O[]; nextCursor?: string }>;
  listPayments(
    input: PageInput & {
      userId?: string;
      orderId?: string;
      status?: PaymentStatus;
    },
  ): Promise<{ items: P[]; nextCursor?: string }>;
}
export class PaymentsError extends Error {
  constructor(
    public readonly code:
      | "UNAVAILABLE"
      | "NOT_FOUND"
      | "BAD_REQUEST"
      | "CONFLICT",
    message: string,
  ) {
    super(message);
  }
}
function owned<T extends { userId: string; deletedAt: Date | null }>(
  record: T | null,
  userId: string,
): T {
  if (!record || record.deletedAt || record.userId !== userId)
    throw new PaymentsError("NOT_FOUND", "Record not found");
  return record;
}
/** A late failure cannot undo a captured payment; a late success cannot undo a refund. */
export function acceptsPaymentStatus(
  current: string,
  incoming: PaymentStatus,
): boolean {
  if (current === "REFUNDED") return incoming === "REFUNDED";
  // SUCCESS is a legacy persisted spelling; never write it for new payments.
  if (current === "SUCCEEDED" || current === "SUCCESS")
    return incoming === "SUCCEEDED" || incoming === "REFUNDED";
  if (current === "FAILED" || current === "EXPIRED")
    return (
      incoming === current ||
      incoming === "SUCCEEDED" ||
      incoming === "REFUNDED"
    );
  return current === "PENDING" || current === "REQUIRES_ACTION";
}

/** Records and customer operations. Payment providers and fulfillment are explicitly composed separately. */
export function createPaymentRecords<
  O extends OrderRecord,
  P extends PaymentRecord,
>(options: {
  repository: PaymentRepository<O, P>;
  isEnabled(): Promise<boolean>;
  orderLifetimeMs?: number;
  paymentLifetimeMs?: number;
}) {
  const lifetime = z.number().int().min(30_000).max(86_400_000);
  const orderLifetime = lifetime.parse(options.orderLifetimeMs ?? 15 * 60_000);
  const paymentLifetime = lifetime.parse(
    options.paymentLifetimeMs ?? 30 * 60_000,
  );
  async function enabled() {
    if (!(await options.isEnabled()))
      throw new PaymentsError("UNAVAILABLE", "New payments are disabled");
  }
  return {
    /** The host supplies a trusted quote/snapshot and eligibility; never forward browser-supplied prices. */
    async createOrder(input: unknown) {
      const draft = orderDraftSchema.parse(input);
      await enabled();
      return options.repository.transaction(
        { kind: "customer", id: draft.userId },
        async (tx) => {
          const now = new Date();
          const existing = await tx.findReusableOrder(draft, now);
          if (existing) return existing;
          return tx.createOrder(draft, new Date(now.getTime() + orderLifetime));
        },
      );
    },
    async preparePayment(input: unknown) {
      const draft = paymentDraftSchema.parse(input);
      await enabled();
      return options.repository.transaction(
        { kind: "order", id: draft.orderId },
        async (tx) => {
          const order = owned(await tx.getOrder(draft.orderId), draft.userId);
          const now = new Date();
          if (order.status !== "PENDING" || order.expiresAt <= now)
            throw new PaymentsError(
              "CONFLICT",
              "Order is no longer open for payment",
            );
          if (await tx.hasSettledPayment(order.id))
            throw new PaymentsError(
              "CONFLICT",
              "A payment already settled for this order",
            );
          if (
            draft.amount !== order.amount ||
            draft.currency !== order.currency.toLowerCase()
          )
            throw new PaymentsError(
              "BAD_REQUEST",
              "Payment must use the order's recorded amount and currency",
            );
          const existing = await tx.findReusablePayment(draft, now);
          if (existing) return existing;
          return tx.createPayment(
            draft,
            new Date(now.getTime() + paymentLifetime),
          );
        },
      );
    },
    getOrder: async (userId: string, orderId: string) =>
      owned(
        await options.repository.getOrder(identifier.parse(orderId)),
        identifier.parse(userId),
      ),
    getPayment: async (userId: string, paymentId: string) =>
      owned(
        await options.repository.getPayment(identifier.parse(paymentId)),
        identifier.parse(userId),
      ),
    listOrders(userId: string, input: unknown) {
      const data = paymentPageSchema
        .extend({ status: orderStatusSchema.optional() })
        .parse(input);
      return options.repository.listOrders({
        ...data,
        userId: identifier.parse(userId),
      });
    },
    listPayments(userId: string, input: unknown) {
      const data = paymentPageSchema
        .extend({
          orderId: identifier.optional(),
          status: paymentStatusSchema.optional(),
        })
        .parse(input);
      return options.repository.listPayments({
        ...data,
        userId: identifier.parse(userId),
      });
    },
    /** Authorize the administrator in the host before using the all-customer readers. */
    listOrdersForAdmin(input: unknown) {
      return options.repository.listOrders(
        paymentPageSchema
          .extend({
            userId: identifier.optional(),
            status: orderStatusSchema.optional(),
          })
          .parse(input),
      );
    },
    listPaymentsForAdmin(input: unknown) {
      return options.repository.listPayments(
        paymentPageSchema
          .extend({
            userId: identifier.optional(),
            orderId: identifier.optional(),
            status: paymentStatusSchema.optional(),
          })
          .parse(input),
      );
    },
    /** Trusted provider processing only. Authenticate/verify the provider evidence before calling; never expose as a customer mutation. */
    async recordVerifiedState(input: unknown) {
      const state = verifiedPaymentStateSchema.parse(input);
      const initial = await options.repository.getPayment(state.paymentId);
      if (!initial) throw new PaymentsError("NOT_FOUND", "Payment not found");
      return options.repository.transaction(
        { kind: "order", id: initial.orderId },
        async (tx) => {
          for (let attempt = 0; attempt < 3; attempt++) {
            const payment = await tx.getPayment(state.paymentId);
            if (!payment)
              throw new PaymentsError("NOT_FOUND", "Payment not found");
            if (payment.paymentGateway.toUpperCase() !== state.gateway)
              throw new PaymentsError(
                "BAD_REQUEST",
                "Payment does not belong to this provider",
              );
            const previousStatus = payment.status;
            if (!acceptsPaymentStatus(previousStatus, state.status))
              return { applied: false, payment, previousStatus };
            const saved = await tx.recordVerifiedState(payment, state);
            if (saved) return { applied: true, payment: saved, previousStatus };
          }
          throw new PaymentsError(
            "CONFLICT",
            "Payment changed concurrently; replay the verified event",
          );
        },
      );
    },
    async cancelUnattemptedOrder(userId: string, orderId: string) {
      identifier.parse(userId);
      identifier.parse(orderId);
      return options.repository.transaction(
        { kind: "order", id: orderId },
        async (tx) => {
          const order = owned(await tx.getOrder(orderId), userId);
          if (order.status === "CANCELLED") return order;
          if (order.status !== "PENDING")
            throw new PaymentsError(
              "CONFLICT",
              "Only pending orders can be cancelled",
            );
          if (await tx.hasPaymentAttempts(orderId))
            throw new PaymentsError(
              "CONFLICT",
              "Resolve the existing payment with its provider before cancelling",
            );
          const cancelled = await tx.cancelUnattemptedOrder(order);
          if (!cancelled)
            throw new PaymentsError(
              "CONFLICT",
              "Order changed; reload before cancelling",
            );
          return cancelled;
        },
      );
    },
  };
}
