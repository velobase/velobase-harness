# Phase 0 Domain Design

Use this before writing product code for a new SaaS on Velobase Harness.

Do not implement until the final gate is satisfied and the user has confirmed the MVP scope.

## 0. Entry Context

First decide where the request came from:

- `launchpad_flow`: the user arrived from Velobase Launchpad with a generated handoff prompt, product brief, repository, and Cloud context.
- `direct_framework`: the user cloned or opened Harness directly, without Launchpad product analysis.

For `launchpad_flow`, validate the handoff and ask only for missing product, billing, integration, or MVP details.

For `direct_framework`, complete this full Phase 0 document before writing product code.

## 1. Ask Missing Questions

Required:

- Product one-liner.
- Target users: developer, creator, enterprise, consumer, marketplace, operator, or other.
- 3-5 core user stories.
- Business model: free, freemium, subscription, credits, hybrid, one-time, or enterprise.
- AI capability: chat, generation, analysis, agents, multimodal, document parsing, or other.

## 2. Product Brief

Output this before implementation:

```yaml
product:
  name: string
  one_liner: string
  target_users: string[]
  core_user_stories: string[]
  business_model: free | freemium | subscription | credits | hybrid | one_time | enterprise
  ai_capabilities: string[]
  target_regions: string[]
  third_party_services: string[]
```

Assertions:

- At least 3 user stories.
- Business model is known.
- At least 1 AI capability.
- Paid products have payment provider or `TBD`.

## 3. Domain Decisions

Use one state: `reuse_framework`, `configure`, `design_needed`, or `not_needed`.

```yaml
domains:
  user: [auth_methods, roles_permissions, profile_fields]
  billing: [billing_model, sku_catalog, credit_consumption]
  operations: [analytics_events, notifications, lifecycle_touch]
  integrations: [auth_provider, payment_provider, email_provider, storage_provider, analytics_provider, ai_provider]
  non_functional: [security, deployment_mode, observability]
```

## 4. User Domain

Decide auth methods, roles, profile extension fields, and lifecycle states: signup, activation, trial, paid, renewal, downgrade, churn, and win-back.

Only output custom roles or user extensions when needed.

## 5. Billing Domain

Choose `none`, `credits`, `subscription`, `hybrid`, or `enterprise`.

If not `none`, define SKUs and credit rules:

```yaml
billing:
  model: credits | subscription | hybrid | enterprise
  skus:
    - key: string
      type: free | subscription_monthly | subscription_yearly | credit_pack | enterprise
      price: string
      credits: number | null
      validity: string
  credit_rules:
    - operation: string
      cost: number
      reason: string
```

If implementing payment code, read `docs/en/integrations/payment/README.md`.

## 6. Operations And Growth

Define only product-specific behavior:

```yaml
operations:
  analytics_events:
    - name: string
      trigger: string
      location: client | server
  notifications:
    - event: string
      internal: boolean
      email: boolean
      in_app: boolean
  funnel:
    - step: string
      event: string
```

Read integration docs when touching analytics, ads, email, Lark, or Telegram.

## 7. Integration Decisions

Mark each as `enable`, `disable`, or `later`:

```yaml
integrations:
  oauth_google: decision
  oauth_github: decision
  stripe: decision
  nowpayments: decision
  storage: decision
  posthog: decision
  google_ads: decision
  lark_or_telegram: decision
  turnstile: decision
  ai_provider: { provider: string, models: string[] }
```

## 8. Data, API, Events

Do not modify framework-reserved auth, billing, order, payment, membership, promo, affiliate, touch, support, or webhook log tables unless requested.

```yaml
entities:
  - name: string
    owner: user | admin | system | shared
    fields: string[]
    relations: string[]
    indexes: string[]
modules:
  - name: string
    path: src/server/<capability>
    router:
      - procedure: string
        type: query | mutation
        access: public | protected | admin
        pagination: boolean
    events:
      - name: string
        trigger: string
        subscribers: string[]
```

Rules:

- Use `cuid()`, ownership fields, timestamps, enums for finite states, and indexes.
- Routers are thin; services own business logic.
- Side effects flow through `appEvents.emit()`.

## 9. MVP Scope

Before implementation, output the MVP scope and feature list for user confirmation:

```yaml
mvp_scope:
  product_name: string
  one_liner: string
  target_users: string[]
  core_user_stories: string[]
  must_have_features: string[]
  nice_to_have_features: string[]
  explicitly_out_of_scope: string[]
  business_model: free | freemium | subscription | credits | hybrid | one_time | enterprise
  required_integrations: string[]
  first_demo_path: string
  acceptance_criteria: string[]
```

Rules:

- Keep `must_have_features` small enough for a first working MVP.
- Put deferred admin, payment, growth, automation, or advanced workflow work in `explicitly_out_of_scope` unless required.
- `first_demo_path` should describe the shortest route where the user can see product value.
- Do not implement until the user confirms this scope.

## 10. Test Plan

```yaml
tests:
  - module: string
    service_unit: required | optional | none
    router_integration: required | optional | none
    worker: required | optional | none
    e2e: required | optional | none
```

Read `docs/en/ai/testing.md` before writing tests.

## 11. Final Gate

Proceed only when:

- Product brief is complete.
- Domain decisions are marked.
- Entities are listed.
- Router procedures are planned.
- Integration decisions are marked.
- Billing model is decided, even if `none`.
- MVP scope, feature list, explicit out-of-scope list, and acceptance criteria are confirmed by the user.
- Test plan is listed.

Then continue with `docs/en/ai/new-module.md`.
