// ============================================================
// PaymentAdapter — provider-neutral contract
// ============================================================

export type PaymentGateway = "STRIPE" | "NOWPAYMENTS" | "LEMONSQUEEZY";

// ---- Checkout ----

export type CheckoutMode = "payment" | "subscription";

export type ProductInterval = "week" | "month" | "year";

export interface CheckoutRequest {
  mode: CheckoutMode;
  orderId: string;
  paymentId: string;
  userId: string;
  amount: number;
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  interval?: ProductInterval;
  intervalCount?: number;
  trialDays?: number;
  productMetadata?: Record<string, unknown>;
}

export interface CheckoutResponse {
  url: string;
  checkoutId?: string;
  transactionId?: string;
  subscriptionId?: string;
  extra?: Record<string, unknown>;
}

// ---- Webhook ----

export type WebhookEventType =
  | "payment.succeeded"
  | "payment.failed"
  | "payment.refunded"
  | "subscription.activated"
  | "subscription.renewed"
  | "subscription.payment_failed"
  | "subscription.updated"
  | "subscription.canceled"
  | "cashflow"
  | "ignored";

export interface WebhookSubscriptionData {
  cancelAtPeriodEnd?: boolean;
  cancelAt?: Date | null;
  canceledAt?: Date | null;
  endedAt?: Date | null;
}

export interface WebhookCashflowData {
  externalId: string;
  kind: string;
  amountCents: number;
  currency: string;
  occurredAt: Date;
  userId?: string | null;
  gatewayChargeId?: string | null;
  gatewayPaymentIntentId?: string | null;
  gatewayInvoiceId?: string | null;
  gatewaySubscriptionId?: string | null;
  sourceEventId?: string | null;
  sourceEventType?: string | null;
}

export interface WebhookEvent {
  type: WebhookEventType;
  checkoutId?: string;
  transactionId?: string;
  subscriptionId?: string;
  amount?: number;
  currency?: string;
  subscription?: WebhookSubscriptionData;
  cashflow?: WebhookCashflowData;
  metadata?: Record<string, string>;
  raw: unknown;
  providerEventId?: string;
}

// ---- Confirm ----

export interface ConfirmResult {
  paid: boolean;
  transactionId?: string;
  subscriptionId?: string;
}

// ---- Adapter ----

export interface PaymentAdapter {
  readonly name: string;

  createCheckout(params: CheckoutRequest): Promise<CheckoutResponse>;

  parseWebhook(req: Request): Promise<WebhookEvent[]>;

  confirmPayment?(checkoutId: string): Promise<ConfirmResult>;

  expireCheckout?(checkoutId: string): Promise<void>;

  ensureCustomer?(userId: string, email?: string): Promise<string>;
}
