# @velobase/mailbox

IMAP/SMTP transport only. Exports mailbox inspection, bounded receiving, SMTP inspection and sending with injected validated configuration. It does not import AI, billing, queues, databases or application auth. Transport verifies TLS certificates, uses connection/socket timeouts, awaits MIME parsing and limits each batch/message size.

Business ownership, cursor durability, authorization, secrets and retry decisions belong to the caller. See `@velobase/email-management` for a business implementation.
