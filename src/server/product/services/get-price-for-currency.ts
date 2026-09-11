import { db } from "@/server/db";
import { selectProductPrice, type ProductCurrency } from "@velobase/products";

/**
 * Supported currencies for multi-currency pricing
 * - USD: Default (uses Product.price)
 * - EUR: Eurozone
 * - GBP: United Kingdom
 * - CHF: Switzerland
 * - AUD: Australia
 */
export type SupportedCurrency = ProductCurrency;

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "AUD",
];

/**
 * Country code to currency mapping
 * Based on user's country, determine which currency to use
 */
const COUNTRY_TO_CURRENCY: Record<string, SupportedCurrency> = {
  // United Kingdom
  GB: "GBP",

  // Switzerland
  CH: "CHF",

  // Australia
  AU: "AUD",

  // Eurozone countries (incl. Croatia)
  AT: "EUR", // Austria
  BE: "EUR", // Belgium
  HR: "EUR", // Croatia
  CY: "EUR", // Cyprus
  CZ: "EUR", // Czechia (non-euro; default to EUR pricing)
  DK: "EUR", // Denmark (non-euro; default to EUR pricing)
  EE: "EUR", // Estonia
  FI: "EUR", // Finland
  FR: "EUR", // France
  DE: "EUR", // Germany
  GR: "EUR", // Greece
  HU: "EUR", // Hungary (non-euro; default to EUR pricing)
  IE: "EUR", // Ireland
  IS: "EUR", // Iceland (EEA; default to EUR pricing)
  IT: "EUR", // Italy
  LI: "EUR", // Liechtenstein (EEA; default to EUR pricing)
  LV: "EUR", // Latvia
  LT: "EUR", // Lithuania
  LU: "EUR", // Luxembourg
  MT: "EUR", // Malta
  NL: "EUR", // Netherlands
  NO: "EUR", // Norway (EEA; default to EUR pricing)
  PL: "EUR", // Poland (non-euro; default to EUR pricing)
  PT: "EUR", // Portugal
  RO: "EUR", // Romania (non-euro; default to EUR pricing)
  SE: "EUR", // Sweden (non-euro; default to EUR pricing)
  SK: "EUR", // Slovakia
  SI: "EUR", // Slovenia
  ES: "EUR", // Spain

  // Other EU/EEA countries: default to EUR pricing when routing to Airwallex
  BG: "EUR", // Bulgaria (non-euro; default to EUR pricing)
};

/**
 * Get the preferred currency for a country code
 * Falls back to USD if country is not mapped
 */
export function getCurrencyForCountry(
  countryCode: string | null | undefined,
): SupportedCurrency {
  if (!countryCode) return "USD";
  const currency = COUNTRY_TO_CURRENCY[countryCode.toUpperCase()];
  return currency ?? "USD";
}

export interface ProductPriceResult {
  currency: SupportedCurrency;
  amount: number; // Price in smallest unit (cents/pence)
  originalAmount: number; // Original price for discount display
  isLocalPrice: boolean; // true if using localized price, false if fallback to USD
}

/**
 * Get product price for a specific currency
 *
 * @param productId - Product ID
 * @param currency - Target currency (EUR, GBP, CHF, or USD)
 * @returns Price info with currency, amount, and whether it's localized
 *
 * If no localized price exists for the currency, falls back to USD (Product.price)
 */
export async function getProductPriceForCurrency(
  productId: string,
  currency: SupportedCurrency,
): Promise<ProductPriceResult> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      price: true,
      originalPrice: true,
      prices: {
        where: { currency },
        select: { amount: true, originalAmount: true },
      },
    },
  });
  if (!product) throw new Error(`Product not found: ${productId}`);
  return selectProductPrice(
    {
      currency: "USD",
      amount: product.price,
      originalAmount: product.originalPrice,
    },
    product.prices.map((price) => ({ ...price, currency })),
    currency,
  );
}

/**
 * Get product price based on country code
 * Automatically determines currency from country and fetches appropriate price
 */
export async function getProductPriceForCountry(
  productId: string,
  countryCode: string | null | undefined,
): Promise<ProductPriceResult> {
  const currency = getCurrencyForCountry(countryCode);
  return getProductPriceForCurrency(productId, currency);
}

/**
 * Get all prices for a product (USD + all localized currencies)
 */
export async function getAllProductPrices(productId: string): Promise<{
  usd: { amount: number; originalAmount: number };
  localized: Array<{
    currency: string;
    amount: number;
    originalAmount: number;
  }>;
}> {
  const [product, localizedPrices] = await Promise.all([
    db.product.findUnique({
      where: { id: productId },
      select: { price: true, originalPrice: true },
    }),
    db.productPrice.findMany({
      where: { productId },
      select: { currency: true, amount: true, originalAmount: true },
    }),
  ]);

  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }

  return {
    usd: {
      amount: product.price,
      originalAmount: product.originalPrice,
    },
    localized: localizedPrices,
  };
}
