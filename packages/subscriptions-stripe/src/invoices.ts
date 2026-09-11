import { z } from "zod";

const remoteId = z
  .union([z.string(), z.object({ id: z.string() })])
  .transform((value) => (typeof value === "string" ? value : value.id));
const optionalId = remoteId.nullish();
const invoiceSchema = z.object({
  id: z.string().startsWith("in_"),
  object: z.literal("invoice"),
  status: z.literal("paid"),
  amount_paid: z.number().int().nonnegative(),
  currency: z.string().regex(/^[a-zA-Z]{3}$/),
  billing_reason: z.string(),
  subscription: optionalId,
  parent: z
    .object({
      subscription_details: z.object({ subscription: optionalId }).nullish(),
    })
    .nullish(),
  lines: z.object({
    has_more: z.literal(false),
    data: z
      .array(
        z.object({
          type: z.string().optional(),
          subscription: optionalId,
          proration: z.boolean().optional(),
          amount: z.number().int(),
          period: z.object({
            start: z.number().int().nonnegative(),
            end: z.number().int().positive(),
          }),
          parent: z
            .object({
              subscription_item_details: z
                .object({
                  subscription: optionalId,
                  proration: z.boolean().optional(),
                })
                .nullish(),
            })
            .nullish(),
        }),
      )
      .min(1)
      .max(1000),
  }),
});

/** Pure normalization of an already signature-verified paid invoice. Do not use invoice.period_*
 * or the current subscription item: neither identifies the period purchased by a delayed invoice.
 * Mixed periods, proration-only invoices and truncated line lists require explicit host policy. */
export function normalizeStripePaidSubscriptionInvoice(input: unknown) {
  const invoice = invoiceSchema.parse(input);
  const invoiceSubscription =
    invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
  const lines = invoice.lines.data.filter((line) => {
    const details = line.parent?.subscription_item_details;
    return (
      (details != null || line.type === "subscription") &&
      !(details?.proration ?? line.proration ?? false) &&
      line.amount >= 0
    );
  });
  const first = lines[0];
  const subscriptionId =
    invoiceSubscription ??
    first?.parent?.subscription_item_details?.subscription ??
    first?.subscription;
  if (!first || !subscriptionId || !subscriptionId.startsWith("sub_"))
    throw new Error(
      "Paid invoice has no unambiguous recurring subscription line",
    );
  if (
    first.period.end <= first.period.start ||
    lines.some((line) => {
      const id =
        line.parent?.subscription_item_details?.subscription ??
        line.subscription ??
        invoiceSubscription;
      return (
        id !== subscriptionId ||
        line.period.start !== first.period.start ||
        line.period.end !== first.period.end
      );
    })
  )
    throw new Error("Paid invoice contains different subscription periods");
  return {
    invoiceId: invoice.id,
    gatewaySubscriptionId: subscriptionId,
    periodStart: new Date(first.period.start * 1000),
    periodEnd: new Date(first.period.end * 1000),
    amountPaid: invoice.amount_paid,
    currency: invoice.currency.toLowerCase(),
    billingReason: invoice.billing_reason,
  };
}
export type StripePaidSubscriptionInvoice = ReturnType<
  typeof normalizeStripePaidSubscriptionInvoice
>;
