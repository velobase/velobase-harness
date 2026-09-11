# SMTP transport

A technical package for SMTP connection inspection and sending. It exports `SmtpConfig`, `OutgoingEmail`, `inspectSmtp` and `sendSmtpEmail`. It knows nothing about inboxes, users, scenes, tickets or AI.

TLS certificate checks are enabled; port 465 uses implicit TLS and other ports require STARTTLS. Each send opens one transport and closes it afterward. A successful result means the SMTP server accepted a recipient, not confirmed delivery to an inbox. Business modules retain delivery identities and handle uncertain results.

`@velobase/mailbox` re-exports the transport under its existing `inspectSmtp` / `sendMailboxEmail` names for compatibility. Outreach can depend on SMTP alone without installing IMAP or a MIME parser.
