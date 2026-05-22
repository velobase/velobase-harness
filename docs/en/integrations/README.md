# Integrations

This directory contains the English canonical documentation for third-party integrations in Velobase Harness.

## Layers

### Core Foundation

| Integration | Services | Purpose | Docs |
| --- | --- | --- | --- |
| Auth | NextAuth + Google + GitHub | Signup, login, session | [auth](./auth/README.md) |
| Email | Resend + SendGrid | Auth email and notifications | [email](./email/README.md) |
| Database | Prisma + PostgreSQL + Redis | Persistence, cache, queue dependency | [database](./database/README.md) |
| Payment | Stripe + LemonSqueezy + NowPayments | Orders, subscriptions, credits | [payment](./payment/README.md) |
| Storage | R2 / S3 / OSS / GCS / MinIO | Uploads and object storage | [storage](./storage/README.md) |
| Queue | Redis + BullMQ | Async jobs, retries, scheduled work | [queue](./queue/README.md) |

### Growth

| Integration | Services | Purpose | Docs |
| --- | --- | --- | --- |
| Analytics | PostHog | Events and feature flags | [analytics](./analytics/README.md) |
| Ads | Google Ads + Twitter Ads | Attribution and conversion upload | [ads](./ads/README.md) |

### Security And Operations

| Integration | Services | Purpose | Docs |
| --- | --- | --- | --- |
| Security | Cloudflare Turnstile | CAPTCHA and anti-abuse boundary | [security](./security/README.md) |

## Rules

- Product code calls framework abstractions, not provider SDKs directly.
- Core flows emit domain events through `appEvents.emit()`.
- Pluggable modules subscribe to events and should be disabled without changing core flows.
- New integrations should document selection, architecture, public interface, configuration, error handling, and AI rules.
