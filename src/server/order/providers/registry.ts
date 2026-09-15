import {
  createPaymentProviderRegistry,
  type PaymentProvider,
} from "@velobase/payments/providers";

const providers = createPaymentProviderRegistry<PaymentProvider>();
export const registerProvider = providers.register;
export const hasProvider = providers.has;
export const getProvider = providers.get;
