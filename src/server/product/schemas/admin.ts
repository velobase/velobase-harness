import { z } from "zod";
import { catalogDetailsSchema } from "@velobase/products";

// Admin product creation schemas
export const adminCreateProductSubscriptionSchema = z.object({
  planType: z.enum(["FREE", "PLUS", "PREMIUM"]),
  interval: z.enum(["WEEK", "MONTH", "YEAR"]),
  creditsPerMonth: z.number().int().min(0),
});

export const adminCreateProductCreditsPackageSchema = z.object({
  creditsAmount: z.number().int().min(1),
});

export const adminCreateProductSchema = z.object({
  name: catalogDetailsSchema.shape.name,
  description: catalogDetailsSchema.shape.description,
  price: catalogDetailsSchema.shape.price,
  originalPrice: catalogDetailsSchema.shape.originalPrice,
  currency: z.literal("USD").default("USD"),
  type: z.enum(["SUBSCRIPTION", "CREDITS_PACKAGE"]),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("INACTIVE"),
  isAvailable: z.boolean().default(false),
  sortOrder: catalogDetailsSchema.shape.sortOrder,
  subscription: adminCreateProductSubscriptionSchema.optional(),
  creditsPackage: adminCreateProductCreditsPackageSchema.optional(),
});

// Admin product update schema
export { updateHostProductSchema as adminUpdateProductSchema } from "@/modules/products/server/schema";

// Admin product delete schema
export const adminDeleteProductSchema = z.object({
  productId: z.string().min(1),
});

// Admin product list schema
export const adminListProductsSchema = z.object({
  type: z.enum(["SUBSCRIPTION", "CREDITS_PACKAGE"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});
