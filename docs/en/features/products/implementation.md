# Complete-example product adapter

This host uses `@velobase/products` with the existing Prisma Product and ProductPrice tables. It does not use the small host's `@velobase/products-core` schema.

The catalog service handles publication, revision checks, soft archival and price edits. Product.price remains the existing USD base price, regardless of the compatibility currency column. The adapter exposes the five supported catalog currencies and retains unrepresented legacy price rows on edits. Existing subscription plans, credit packages and one-time entitlement relationships are unchanged by a catalog edit. Trial and subscription/credit-package updates are explicit host extensions in `server/service.ts` and share its transaction.

The existing Admin detail sheet's Edit tab uses this service for name, plain-text descriptions, display order and authored prices. Structured legacy descriptions remain untouched. The editor and availability switch send the displayed revision, preventing an intervening edit from being overwritten. Existing product lists and commerce details remain in the complete-example UI.

`product.list` is an administrator query. Public product reads enforce publication and the feature switch. Admin can edit, unpublish or archive while public products are disabled, but cannot publish a previously unpublished product. Trusted fulfillment reads can retain historical product data. New orders additionally require a published, available product with a fulfillment type; catalog-only drafts (`UNDEFINED`) are not purchasable.

Pricing and checkout select authored currency prices through the neutral package. When a local price is absent, the displayed amount and currency both fall back to USD. This does not change already captured order or payment amounts.

The complete example still contains its checkout, subscription and fulfillment dependencies. Using this adapter is not equivalent to removing them. Keep the catalog connected to the existing Harness routes while resolving those dependencies.
