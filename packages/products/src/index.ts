import { z } from "zod";

export const productsFeature = {
  id: "products",
  category: "business",
  dependencies: [],
  defaultEnabled: false,
  href: "/admin/products",
} as const;
export const supportedCurrencies = ["USD", "EUR", "GBP", "CHF", "AUD"] as const;
export const currencySchema = z.enum(supportedCurrencies);
export type ProductCurrency = z.infer<typeof currencySchema>;
const amount = z.number().int().min(0).max(2_147_483_647);
const identifier = z.string().min(1).max(256);
export const productPriceSchema = z.object({
  currency: currencySchema,
  amount,
  originalAmount: amount.default(0),
});
export type ProductPrice = z.output<typeof productPriceSchema>;
export const catalogDetailsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(20000).default(""),
  price: amount,
  originalPrice: amount.default(0),
  currency: currencySchema.default("USD"),
  sortOrder: z.number().int().min(-2_147_483_648).max(2_147_483_647).default(0),
  prices: z
    .array(productPriceSchema)
    .max(supportedCurrencies.length)
    .default([]),
});
export const catalogUpdateSchema = catalogDetailsSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  isAvailable: z.boolean().optional(),
});
export const catalogPageSchema = z.object({
  cursor: identifier.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).default(""),
  includeArchived: z.boolean().default(false),
});
export type CatalogDetails = z.output<typeof catalogDetailsSchema>;
export type CatalogUpdate = z.output<typeof catalogUpdateSchema>;
export type CatalogPage = z.output<typeof catalogPageSchema>;
export interface CatalogProduct {
  id: string;
  name: string;
  description: unknown;
  price: number;
  originalPrice: number;
  currency: ProductCurrency;
  prices: ProductPrice[];
  status: "UNDEFINED" | "ACTIVE" | "INACTIVE";
  isAvailable: boolean;
  sortOrder: number;
  deletedAt: Date | null;
  revision: string;
}
export interface CatalogRepository<T extends CatalogProduct> {
  get(id: string): Promise<T | null>;
  create(
    input: CatalogDetails & { status: "INACTIVE"; isAvailable: false },
  ): Promise<T>;
  /** Compare revision and change details/prices atomically. Return null on a concurrent edit. */
  update(
    id: string,
    revision: string,
    change: CatalogUpdate & { deletedAt?: Date },
  ): Promise<T | null>;
  list(
    input: CatalogPage & { publicOnly: boolean },
  ): Promise<{ items: T[]; nextCursor?: string }>;
}
export class ProductCatalogError extends Error {
  constructor(
    public readonly code:
      | "UNAVAILABLE"
      | "NOT_FOUND"
      | "CONFLICT"
      | "BAD_REQUEST",
    message: string,
  ) {
    super(message);
  }
}
export function isPublished(
  product: Pick<CatalogProduct, "status" | "isAvailable" | "deletedAt">,
) {
  return (
    product.status === "ACTIVE" && product.isAvailable && !product.deletedAt
  );
}
function validatePrices(baseCurrency: ProductCurrency, prices: ProductPrice[]) {
  const currencies = new Set<ProductCurrency>();
  for (const price of prices) {
    if (price.currency === baseCurrency || currencies.has(price.currency))
      throw new ProductCatalogError(
        "BAD_REQUEST",
        "Each currency must have one price; the base currency is edited separately",
      );
    currencies.add(price.currency);
  }
}
/** Price lists are authored prices, not exchange rates. A fallback keeps its actual currency. */
export function selectProductPrice(
  base: ProductPrice,
  localized: readonly ProductPrice[],
  requested: ProductCurrency,
) {
  const fallback = productPriceSchema.parse(base);
  const currency = currencySchema.parse(requested);
  if (currency === fallback.currency)
    return { ...fallback, isLocalPrice: true };
  const found = localized.find((price) => price.currency === currency);
  return found
    ? { ...productPriceSchema.parse(found), isLocalPrice: true }
    : { ...fallback, isLocalPrice: false };
}
export function formatProductPrice(
  value: number,
  currency: ProductCurrency,
  locale = "en-US",
) {
  const cents = amount.parse(value);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencySchema.parse(currency),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
export function parseProductPrice(input: unknown) {
  const value = z
    .string()
    .trim()
    .regex(/^\d{1,8}(?:\.\d{1,2})?$/)
    .parse(input);
  const [whole, fraction = ""] = value.split(".");
  return amount.parse(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
}
export function createProductCatalog<T extends CatalogProduct>(options: {
  repository: CatalogRepository<T>;
  isEnabled(): Promise<boolean>;
}) {
  async function get(id: string) {
    const product = await options.repository.get(identifier.parse(id));
    if (!product)
      throw new ProductCatalogError("NOT_FOUND", "Product not found");
    return product;
  }
  async function update(id: string, input: unknown, expectedRevision?: string) {
    const parsed = catalogUpdateSchema.parse(input);
    // An omitted optional field must not erase the stored value in a partial update.
    const change = Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value !== undefined),
    ) as CatalogUpdate;
    const product = await get(id);
    if (product.deletedAt)
      throw new ProductCatalogError(
        "CONFLICT",
        "Archived products cannot be edited",
      );
    if (expectedRevision !== undefined && product.revision !== expectedRevision)
      throw new ProductCatalogError(
        "CONFLICT",
        "Product changed; reload before saving",
      );
    const next = { ...product, ...change };
    validatePrices(next.currency, next.prices);
    if (
      !isPublished(product) &&
      isPublished(next) &&
      !(await options.isEnabled())
    )
      throw new ProductCatalogError(
        "UNAVAILABLE",
        "Enable the product catalog before publishing",
      );
    const saved = await options.repository.update(id, product.revision, change);
    if (!saved)
      throw new ProductCatalogError(
        "CONFLICT",
        "Product changed; reload before saving",
      );
    return saved;
  }
  return {
    async createDraft(input: unknown) {
      const data = catalogDetailsSchema.parse(input);
      validatePrices(data.currency, data.prices);
      return options.repository.create({
        ...data,
        status: "INACTIVE",
        isAvailable: false,
      });
    },
    update,
    publish: (id: string, revision?: string) =>
      update(id, { status: "ACTIVE", isAvailable: true }, revision),
    unpublish: (id: string, revision?: string) =>
      update(id, { isAvailable: false }, revision),
    getForAdmin: get,
    /** Trusted fulfillment/history readers may use stored data after public sales stop. */
    getStored: get,
    async getPublic(id: string) {
      if (!(await options.isEnabled()))
        throw new ProductCatalogError(
          "UNAVAILABLE",
          "The product catalog is disabled",
        );
      const product = await get(id);
      if (!isPublished(product))
        throw new ProductCatalogError("NOT_FOUND", "Product not found");
      return product;
    },
    async listPublic(input: unknown) {
      const data = catalogPageSchema.parse(input);
      if (!(await options.isEnabled()))
        return { items: [] as T[], nextCursor: undefined };
      return options.repository.list({
        ...data,
        includeArchived: false,
        publicOnly: true,
      });
    },
    listForAdmin: (input: unknown) =>
      options.repository.list({
        ...catalogPageSchema.parse(input),
        publicOnly: false,
      }),
    async archive(id: string, expectedRevision?: string) {
      const product = await get(id);
      if (product.deletedAt) return product;
      if (
        expectedRevision !== undefined &&
        product.revision !== expectedRevision
      )
        throw new ProductCatalogError(
          "CONFLICT",
          "Product changed; reload before archiving",
        );
      const saved = await options.repository.update(id, product.revision, {
        status: "INACTIVE",
        isAvailable: false,
        deletedAt: new Date(),
      });
      if (!saved)
        throw new ProductCatalogError(
          "CONFLICT",
          "Product changed; reload before archiving",
        );
      return saved;
    },
  };
}
