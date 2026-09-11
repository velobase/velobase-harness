# Activities

Install `@velobase/activities: workspace:*` in a host that operates campaigns.

This package depends only on Zod.

It owns campaign input schemas, draft/publication rules, reward validation, date windows and participation eligibility.

Billing/provider SDKs are supplied by the host's reward adapter, not imported here.

`createCampaigns({ repository, requireEnabled, requireReward })` supplies `createDraft` and `update`.

The repository implements `find`, `findCode`, `create` and `update`; the host owns its database schema and unique code constraint.

`requireEnabled` checks the persisted campaign capability.

`requireReward` checks that the selected reward can be delivered by this deployment.

It must not deliver a reward during publication.

New campaigns are always `DRAFT`.

A global feature switch never publishes drafts.

Publishing requires an enabled capability, valid dates and an available reward.

Disabling a campaign and reading participation history remain possible while global participation is off.

`campaignEligibility` is shared by preview and the host's locked redemption transaction.

The host must atomically claim capacity and retain a stable reward identity before calling its fulfillment service; a successful preview does not reserve a place.

The complete example retains its existing one-redemption-per-user ledger identity and product fulfillment adapters.

The complete example binds the package in `src/modules/activities/server/promo-admin.ts`, uses its schemas in the Admin router, and uses its eligibility policy in redemption.

Existing `PromoCode` / `PromoCodeRedemption` tables and routes remain.

The root migration adds `DRAFT`.

Newcomer offers and daily rewards remain separate, explicitly switched policies in the complete example.

`activitiesFeature` supplies the `promo-codes` metadata entry with an explicit credits dependency and defaults off.

Product reward fulfillment is a separate host choice.

Removing the service requires removing the host's campaign adapters/routes; stopping participation preserves existing records and accepted rewards.
