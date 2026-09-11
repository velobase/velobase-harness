import {
  publicProcedure,
  protectedProcedure,
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import {
  productCatalog,
  productOperation,
} from "@/modules/products/server/service";
import {
  getProductSchema,
  hitPaywallSchema,
  listProductsSchema,
} from "../schemas";
import { getProduct } from "../services/get";
import { listProducts } from "../services/list";
import { listAvailableProducts } from "../services/list-available";
import { listUserAvailableProducts } from "../services/list-user-available";
import { listForPricing } from "../services/list-for-pricing";
import { ensureNewUserUnlockOffer } from "@/server/offers/services/ensure-new-user-unlock-offer";

export const productRouter = createTRPCRouter({
  // Get single product with localized pricing
  get: publicProcedure.input(getProductSchema).query(async ({ input, ctx }) => {
    await productOperation(() => productCatalog.getPublic(input.productId));
    return getProduct({
      productId: input.productId,
      userId: ctx.session?.user?.id,
      fallbackHeaders: ctx.headers,
    });
  }),

  // List all products (admin use)
  list: adminProcedure.input(listProductsSchema).query(async ({ input }) => {
    return listProducts(input);
  }),

  // List available products (public, no user context)
  listAvailable: publicProcedure
    .input(listProductsSchema.pick({ type: true, limit: true, offset: true }))
    .query(async ({ input }) => {
      return listAvailableProducts(input);
    }),

  // List user-specific available products (protected)
  listUserAvailable: protectedProcedure
    .input(listProductsSchema.pick({ type: true, limit: true, offset: true }))
    .query(async ({ input, ctx }) => {
      return listUserAvailableProducts({
        userId: ctx.session.user.id,
        ...input,
      });
    }),

  // List products for pricing page (unified: works for both logged in and anonymous)
  listForPricing: publicProcedure
    .input(
      listProductsSchema.pick({
        type: true,
        productIds: true,
        limit: true,
        offset: true,
      }),
    )
    .query(async ({ input, ctx }) => {
      return listForPricing({
        ...input,
        userId: ctx.session?.user?.id, // Optional: pass user ID if logged in
        headers: ctx.headers,
      });
    }),

  // Paywall hit (e.g. video unlock drawer opened): starts limited-time offer timer (protected)
  hitPaywall: protectedProcedure
    .input(hitPaywallSchema)
    .mutation(async ({ input, ctx }) => {
      const offer = await ensureNewUserUnlockOffer({
        userId: ctx.session.user.id,
        source: input.source,
        variant: input.variant,
      });
      return {
        state: offer.state,
        endsAt: offer.endsAt ?? null,
        startedAt: offer.startedAt ?? null,
        isEligible: offer.isEligible,
        hitPaywallCount: offer.hitPaywallCount,
      };
    }),
});
