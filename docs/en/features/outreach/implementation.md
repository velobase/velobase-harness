# Complete-example outreach adapter

This module binds `@velobase/outreach` to existing touch tables, feature state and email providers. The domain package owns scheduling, frozen message content, claims, cancellation and uncertain outcomes. The adapter owns user/notification policy and persistence mappings.

New generic messages use `referenceType=OUTREACH`. The existing subscription reminder processor handles its original records separately, preserving business eligibility checks and historical data. Both processors run in the touch Worker. Admin entry: `/admin/touches/outreach`; existing history and scene editors remain available under `/admin/touches`.

The module can create drafts and cancel pending messages while globally disabled. Scheduling and processing consult persisted feature state. The Admin procedures authenticate each operation; the domain service itself is intended for trusted server/scheduler callers.
