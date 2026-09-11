# Activities

Marketing activities are distinct from outreach scheduling. Current independent switches cover promo campaigns, newcomer offers and daily rewards.

Promo campaigns own their draft/publication state, code, reward, starts/expiry dates and redemption records. New campaigns are `DRAFT`. Publishing requires the promo capability and a valid reward/time range. `/admin/promo-codes` manages campaigns; `/admin/promo-codes/[id]` lists participation. Turning the global switch on does not publish drafts. Turning it off blocks redemption without erasing campaigns or history.

Newcomer-offer and daily-reward services enforce their own switches before creating new eligibility or grants. Existing payment fulfillment and historical reward records remain. Shared transport providers and touch delivery schedules do not own campaign state.

This adapter uses `@velobase/activities` for campaign lifecycle, input schemas and eligibility. That package depends only on Zod. The complete example retains its existing database, redemption/fulfillment adapters and Admin UI; those adapters are not an independently installable commerce bundle. Tests are not run for this implementation at the user's request.
