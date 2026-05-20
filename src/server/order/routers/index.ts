import { createTRPCRouter } from "@/server/api/trpc";
import { createOrderProcedure } from "./procedures/create-order";
import { getOrderProcedure } from "./procedures/get-order";
import { listOrdersProcedure } from "./procedures/list-orders";
import { cancelOrderProcedure } from "./procedures/cancel-order";
import { checkoutProcedure } from "./procedures/checkout";
import { getPaymentProcedure } from "./procedures/get-payment";
import { listPaymentsProcedure } from "./procedures/list-payments";
import { refundPaymentProcedure } from "./procedures/refund-payment";
import { createSetupIntentProcedure } from "./procedures/create-setup-intent";
import { confirmPaymentProcedure } from "./procedures/confirm-payment";
import { quickPurchaseProcedure } from "./procedures/quick-purchase";
import { hasSavedCardProcedure } from "./procedures/has-saved-card";
import { getCryptoCheckoutPreviewProcedure } from "./procedures/get-crypto-checkout-preview";
import { getCryptoCurrenciesProcedure } from "./procedures/get-crypto-currencies";
import { estimateCryptoPriceProcedure } from "./procedures/estimate-crypto-price";
import { createCryptoInvoiceProcedure } from "./procedures/create-crypto-invoice";
import { getAvailableGatewaysProcedure } from "./procedures/get-available-gateways";

export const orderRouter = createTRPCRouter({
  // Order CRUD
  createOrder: createOrderProcedure,
  getOrder: getOrderProcedure,
  listOrders: listOrdersProcedure,
  cancelOrder: cancelOrderProcedure,

  // Checkout
  checkout: checkoutProcedure,
  quickPurchase: quickPurchaseProcedure,

  // Payment
  getPayment: getPaymentProcedure,
  listPayments: listPaymentsProcedure,
  confirmPayment: confirmPaymentProcedure,
  refundPayment: refundPaymentProcedure,

  // Stripe
  createSetupIntent: createSetupIntentProcedure,
  hasSavedCard: hasSavedCardProcedure,

  // Crypto
  getCryptoCheckoutPreview: getCryptoCheckoutPreviewProcedure,
  getCryptoCurrencies: getCryptoCurrenciesProcedure,
  getEstimate: estimateCryptoPriceProcedure,
  createCryptoInvoice: createCryptoInvoiceProcedure,

  // Gateway availability
  getAvailableGateways: getAvailableGatewaysProcedure,
});
