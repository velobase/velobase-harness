# Product catalog

`@velobase/products` owns product descriptions, authored prices, publication and archival.

Its only dependency is Zod.

It does not install an ORM, payment provider, subscription model, credit ledger, AI provider or Web framework.

Choose a `CatalogRepository` and supply an `isEnabled()` function to `createProductCatalog`.

The repository persists catalog records and performs atomic compare-and-update using the record's revision, including replacement of alternate prices.

`getStored` supports trusted historical/fulfillment readers; authorize those callers in the host.

Public callers use `getPublic` or `listPublic`, which enforce the catalog switch and publication state.

| Operation                                        | Enabled                | Disabled                 |
| ------------------------------------------------ | ---------------------- | ------------------------ |
| Create a draft, edit existing details/prices     | Allowed                | Allowed                  |
| Publish an unpublished product                   | Allowed                | Rejected                 |
| Read the public catalog or a public product      | Published records only | Empty list / unavailable |
| Unpublish or archive                             | Allowed                | Allowed                  |
| Read existing records in Admin / trusted history | Allowed                | Allowed                  |

Archive is a soft deletion, preserving records referenced by past transactions.

Archived products cannot be edited or republished.

Concurrent edits produce `CONFLICT`; callers should reload instead of silently overwriting.

Disabling hides published products without rewriting their status, so re-enabling restores previously published records.

Prices use integer minor units.

The supported currencies (USD, EUR, GBP, CHF and AUD) all use two decimal places; this is an explicit supported set rather than a universal currency conversion API.

`parseProductPrice` converts entered decimal strings without floating-point rounding.

`selectProductPrice` uses a separately authored local price when available and otherwise returns the base amount **with its actual base currency**.

It does not perform foreign exchange conversion or combine original/discount prices from different currencies.

Changing a base currency requires the administrator to enter the intended amounts.

For the complete example's existing Product tables, see [its adapter](../../src/modules/products/README.md).

Checkout and fulfillment are separate host capabilities and must use trusted server-side product data when taking an order; accepting a catalog ID is not enough to define what a buyer receives.

This is a workspace source package, not a separately published npm release.

No tests or runtime flows were executed for this change.
