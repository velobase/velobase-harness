import {
  createPaymentProviderRegistry,
  type PaymentProvider,
} from "@velobase/payments/providers";

const providers = createPaymentProviderRegistry<PaymentProvider>();
export const registerProvider = providers.register.bind(providers);
export const hasProvider = providers.has.bind(providers);
export const getProvider = providers.get.bind(providers);
