// Avoid importing Prisma types directly to keep provider generic

export type PaymentGateway = "STRIPE" | "NOWPAYMENTS" | "LEMONSQUEEZY";

export type PaymentStatus =
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED"
  | "REQUIRES_ACTION";

export interface CreatePaymentResult {
  paymentUrl: string;
  gatewayTransactionId?: string;
  providerExtra?: Record<string, unknown>;
  /**
   * Optional provider-specific checkout/session identifier.
   * For Stripe this is the Checkout Session ID (cs_...).
   * For LemonSqueezy this is the Checkout ID.
   */
  checkoutSessionId?: string;
}

export interface CreateSubscriptionResult {
  paymentUrl: string;
  gatewaySubscriptionId?: string;
  providerExtra?: Record<string, unknown>;
  /**
   * Optional provider transaction identifier.
   * For Airwallex Billing Checkout, this is the Billing Checkout ID.
   */
  gatewayTransactionId?: string;
  /**
   * Optional provider-specific checkout/session identifier.
   * For Stripe this is the Checkout Session ID (cs_...).
   */
  checkoutSessionId?: string;
}

export type ProductInterval = "month" | "year";
export interface ProductSnapshot {
  name?: string;
  interval?: ProductInterval;
  metadata?: unknown;
  [key: string]: unknown;
}

export interface ProviderOrder {
  id: string;
  amount: number;
  currency: string;
  productSnapshot?: ProductSnapshot | null;
}

export interface PaymentExtra {
  SuccessURL?: string;
  CancelURL?: string;
  FailedURL?: string;
  TraceData?: Record<string, string>;
  [key: string]: unknown;
}

export type GatewayResponse = Record<string, unknown>;

export interface ProviderPayment {
  id: string;
  extra: PaymentExtra | null;
}

export interface PaymentWebhookResult {
  getStatus(): PaymentStatus;
  getGatewayTransactionId(): string | undefined;
  getGatewaySubscriptionId(): string | undefined;
  getSubscriptionPeriod(): number; // 0: N/A, 1: initial, >1: renewal
  getAmount(): number | undefined; // cents
  getCurrency(): string | undefined;
  getRawData(): unknown;
  getData(): unknown;
}

export interface SubscriptionWebhookResult {
  getStatus(): PaymentStatus;
  getGatewaySubscriptionId(): string | undefined;
  getRawData(): unknown;
  getData(): unknown;
  /**
   * Normalized, business-facing subscription webhook payload.
   * Providers should populate this so business logic does not depend on provider-specific raw fields.
   */
  getNormalizedData(): NormalizedSubscriptionWebhookData;
}

export interface PaymentProvider {
  createPayment(params: {
    payment: ProviderPayment;
    order: ProviderOrder;
  }): Promise<CreatePaymentResult>;
  createSubscription(params: {
    payment: ProviderPayment;
    order: ProviderOrder;
  }): Promise<CreateSubscriptionResult>;

  handlePaymentWebhook(req: Request): Promise<PaymentWebhookResult | null>;
  handleSubscriptionWebhook(
    req: Request,
  ): Promise<SubscriptionWebhookResult | null>;

  queryPaymentStatus?(gatewayTransactionId: string): Promise<PaymentStatus>;

  /**
   * Provider-specific active confirmation (used to mitigate webhook delays).
   * Should NOT mutate local DB; only queries provider and returns the paid status + any discovered IDs.
   */
  confirmPayment?(params: {
    checkoutSessionId?: string;
    gatewayTransactionId?: string;
  }): Promise<{
    isPaid: boolean;
    gatewayTransactionId?: string;
    gatewaySubscriptionId?: string;
  }>;

  /**
   * Provider-specific checkout/session invalidation.
   * For Stripe this expires the Checkout Session (cs_...).
   */
  expireCheckoutSession?(checkoutSessionId: string): Promise<void>;
}

export class BaseWebhookResult
  implements PaymentWebhookResult, SubscriptionWebhookResult
{
  private status: PaymentStatus;
  private gatewayTransactionId?: string;
  private gatewaySubscriptionId?: string;
  private subscriptionPeriod: number;
  private amount?: number;
  private currency?: string;
  private rawData: unknown;
  private isSubscription: boolean;
  private normalizedData: NormalizedSubscriptionWebhookData;

  constructor(args: {
    status: PaymentStatus;
    gatewayTransactionId?: string;
    gatewaySubscriptionId?: string;
    subscriptionPeriod?: number;
    amount?: number;
    currency?: string;
    rawData: unknown;
    isSubscription?: boolean;
    normalizedData?: NormalizedSubscriptionWebhookData;
  }) {
    this.status = args.status;
    this.gatewayTransactionId = args.gatewayTransactionId;
    this.gatewaySubscriptionId = args.gatewaySubscriptionId;
    this.subscriptionPeriod = args.subscriptionPeriod ?? 0;
    this.amount = args.amount;
    this.currency = args.currency;
    this.rawData = args.rawData;
    this.isSubscription = args.isSubscription ?? false;
    this.normalizedData = args.normalizedData ?? {};
  }

  getStatus() {
    return this.status;
  }
  getGatewayTransactionId() {
    return this.gatewayTransactionId;
  }
  getGatewaySubscriptionId() {
    return this.gatewaySubscriptionId;
  }
  getSubscriptionPeriod() {
    return this.subscriptionPeriod;
  }
  getAmount() {
    return this.amount;
  }
  getCurrency() {
    return this.currency;
  }
  getRawData() {
    return this.rawData;
  }
  getNormalizedData() {
    return this.normalizedData;
  }
  getData() {
    if (this.isSubscription) {
      return {
        status: this.status,
        gateway_subscription_id: this.gatewaySubscriptionId,
      };
    }
    return {
      status: this.status,
      gateway_transaction_id: this.gatewayTransactionId,
      ...(this.gatewaySubscriptionId
        ? { gateway_subscription_id: this.gatewaySubscriptionId }
        : {}),
      ...(this.subscriptionPeriod
        ? { subscription_period: this.subscriptionPeriod }
        : {}),
    };
  }
}

export interface NormalizedSubscriptionWebhookData {
  /**
   * "Cancel at period end" semantics: true means the subscription is scheduled to stop renewing.
   * For Stripe this should be computed as: cancel_at_period_end === true OR cancel_at is set.
   */
  cancelAtPeriodEnd?: boolean;
  /**
   * Provider's scheduled cancellation timestamp, if any (e.g. Stripe cancel_at).
   */
  cancelAt?: Date | null;
  /**
   * Provider's cancellation request timestamp, if any (e.g. Stripe canceled_at).
   */
  canceledAt?: Date | null;
  /**
   * Provider's ended timestamp, if any (e.g. Stripe ended_at).
   */
  endedAt?: Date | null;
}
