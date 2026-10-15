# AI Testing Guide

Use this before creating or modifying tests.

Goal: test business behavior with the smallest reliable layer. Prioritize correctness, permissions, billing, persistence, worker idempotency, and critical user flows.

## 1. Pick The Test Layer

Use the lowest useful layer:

- Business rule, calculation, state transition: service unit test.
- Input validation, auth, ownership, persistence: tRPC router integration test.
- Hono route, webhook, health endpoint: HTTP route test.
- Queue processor logic: processor unit test.
- Full user journey: Playwright E2E.

Default pyramid: many service tests, some integration tests, few E2E tests.

## 2. Coverage By Change Type

Service change:

- Add or update `service.test.ts`.
- Cover happy path and one edge/error path per public method.

Router change:

- Test access level.
- Test invalid input.
- Test user data isolation.

Billing/payment change:

- Test no double grant or deduction.
- Test webhook idempotency when relevant.
- Test invalid or unsigned webhook payloads.

Worker change:

- Test processor directly.
- Test retry-safe behavior.
- Test progress updates if used.

## 3. Service Unit Tests

Place tests next to source:

```text
src/server/<capability>/
├── service.ts
└── service.test.ts
```

Rules:

- Mock all I/O: database, network, storage, email, payment, queues.
- Test behavior, not Prisma internals.
- Use fake timers for time-dependent logic.

## 4. Router Integration Tests

Test procedure access level, input validation, ownership boundaries, and pagination shape.

Use a test database for ownership or persistence. Do not use real external providers.

## 5. Hono, Webhook, Worker

Hono/webhook: use `app.request()` or existing HTTP helpers; test health endpoints, invalid signatures, disabled module 404s, and idempotency.

Worker: test processor functions directly; do not start a real worker unless the project already does; mock AI APIs, storage, payment, email, and analytics; verify side-effect idempotency.

## 6. E2E Tests

Use E2E only for signup/signin, first core feature use, purchase/subscription in test mode, or critical admin flows. Keep E2E few and stable; cover edge cases below E2E.

## 7. AI Generation Rules

Must:

- Put tests next to source unless the project has another convention.
- Use natural test names such as `should reject negative credit amount`.
- Add happy path and edge/error tests for public service methods.
- Mock all external I/O in unit tests.

Must not:

- Do not test framework internals.
- Do not access real external services.
- Do not write snapshots unless requested.
- Do not hard-code current time; use fake timers.
- Do not add broad E2E coverage for behavior better covered below E2E.

## 8. Before Final Response

- Run the narrowest relevant test command if available.
- If no test command exists, say tests were not run and why.
- If test infrastructure changed, also run lint/typecheck when practical.
