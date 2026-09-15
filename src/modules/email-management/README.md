# Email management in the complete example

Owns manual inbox/ticket/reply operations over existing `SupportTicket` and `SupportTimeline` data. Admin pages: `/admin/email`, `/admin/connections`, `/admin/features`.

The `email-management` switch controls receiving and manual sending. `ai-support` controls model processing separately. No AI configuration is required for manual work. Environment `EMAIL_MANAGEMENT_MODE=off` prevents its worker contribution from loading. Changing environment mode requires process restart; changing the Admin switch does not.

Receiving uses TLS with certificate verification, bounded batches, a database lease and an ordered durable UID cursor. A failed import stops cursor advancement. Mail identity is deduplicated, ticket updates are transactional, and threading also checks the sender.

Replies use a durable outbox identity. `PENDING` work is picked up by Worker; without configured Redis, the Admin request sends directly. `SENDING` is claimed atomically; `SENT` records the timeline; `UNKNOWN` requires checking delivery logs before another send. Pending work can be canceled while the feature is off. Disabling the AI extension also stops its pending automatic replies.

For the independent business package and smaller dependency closure, see [composition](../../../docs/en/modules/composition.md). The complete example preserves legacy tables and URLs. Tests are not run for this implementation at the user's request.
