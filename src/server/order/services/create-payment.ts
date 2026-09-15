import {
  paymentRecords,
  paymentOperation,
} from "@/modules/payments/server/service";

interface CreatePaymentParams {
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  isSubscription?: boolean;
  paymentGateway?: string;
  extra?: Record<string, unknown>;
}
export async function createPayment({
  paymentGateway = "STRIPE",
  ...input
}: CreatePaymentParams) {
  const cryptoCurrency = input.extra?.requestedCryptoCurrency;
  return paymentOperation(() =>
    paymentRecords.preparePayment({
      ...input,
      paymentGateway,
      reuseKey:
        paymentGateway.toUpperCase() === "NOWPAYMENTS" &&
        typeof cryptoCurrency === "string" &&
        cryptoCurrency
          ? cryptoCurrency
          : undefined,
    }),
  );
}
