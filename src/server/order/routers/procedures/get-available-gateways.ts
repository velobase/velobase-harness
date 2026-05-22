import { publicProcedure } from "@/server/api/trpc";
import { env } from "@/env";

export const getAvailableGatewaysProcedure = publicProcedure.query(() => {
  return {
    STRIPE: !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
    NOWPAYMENTS: !!(env.NOWPAYMENTS_API_KEY && env.NOWPAYMENTS_IPN_SECRET),
    LEMONSQUEEZY: !!(env.LEMONSQUEEZY_API_KEY && env.LEMONSQUEEZY_STORE_ID && env.LEMONSQUEEZY_WEBHOOK_SECRET),
  };
});
