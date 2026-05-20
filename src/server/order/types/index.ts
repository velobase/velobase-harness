import type { Order, Payment, Product, ProductType, ProductStatus } from "@prisma/client";

// Order types
export type OrderType = "NEW_PURCHASE" | "RENEWAL" | "UPGRADE" | "DOWNGRADE" | "PROMO_GRANT";
export type OrderStatus =
  | "PENDING"
  | "FULFILLED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED";

// Payment types
export type PaymentStatus =
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED";
export type { PaymentGateway } from "../providers/types";

// Product types
export type ProductInterval = "month" | "year";

// Export Prisma types for compatibility
export type { ProductType, ProductStatus };

// Extended types
export type OrderWithRelations = Order & {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  product: Product;
  payments: Payment[];
};

export type PaymentWithRelations = Payment & {
  order: Order;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
};

export type ProductWithStats = Product & {
  _count?: {
    orders: number;
  };
};

// Stripe types
export interface StripeCheckoutSession {
  sessionId: string;
  url: string;
  orderId: string;
  paymentId: string;
}

export interface StripeSubscription {
  subscriptionId: string;
  customerId: string;
  status: string;
  currentPeriodEnd: Date;
}

// Request/Response types
export interface CreateOrderRequest {
  productId: string;
  userId: string;
  type?: OrderType;
}

export interface CreateCheckoutSessionRequest {
  orderId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface ProcessWebhookRequest {
  signature: string;
  body: string;
}

export interface RefundPaymentRequest {
  paymentId: string;
  amount?: number;
  reason?: string;
}

