import { z } from "zod";

const reference = z.string().trim().min(1).max(256);
const returnUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "An absolute HTTP(S) return URL is required");

/** Trusted, frozen checkout terms. Customers select an offer; the host supplies its price and owner. */
export const recurringCheckoutSchema = z.object({
  requestId: reference,
  name: z.string().trim().min(1).max(500),
  amount: z.number().int().positive().max(2_147_483_647),
  currency: z
    .string()
    .regex(/^[a-zA-Z]{3}$/)
    .transform((value) => value.toLowerCase()),
  interval: z.enum(["week", "month", "year"]),
  intervalCount: z.number().int().min(1).max(36).default(1),
  successUrl: returnUrl,
  cancelUrl: returnUrl,
  customerId: reference.optional(),
  trialDays: z.number().int().min(1).max(730).optional(),
  expiresAt: z.number().int().positive().optional(),
  requireThreeDSecure: z.boolean().default(false),
  metadata: z.record(z.string().max(500)).default({}),
});
export type RecurringCheckout = z.output<typeof recurringCheckoutSchema>;
export interface RecurringCheckoutEvidence {
  checkoutId: string;
  requestId?: string;
  requestDigest?: string;
  status: "open" | "complete" | "expired" | null;
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  url?: string;
  customerId?: string;
  subscriptionId?: string;
  quote: {
    amount: number;
    currency: string;
    interval: string;
    intervalCount: number;
    quantity: number;
  } | null;
}
export interface RecurringCheckoutProvider {
  create(input: RecurringCheckout): Promise<RecurringCheckoutEvidence>;
  inspect(checkoutId: string): Promise<RecurringCheckoutEvidence>;
  /** Return the provider-confirmed state; a completed session cannot be locally treated as expired. */
  expire(checkoutId: string): Promise<RecurringCheckoutEvidence>;
}
