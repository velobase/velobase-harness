# Phase 0 领域设计

在基于 Velobase Harness 编写新 SaaS 产品代码前阅读本文档。

在最终关卡满足、且用户确认 MVP 范围之前，不要实现产品代码。

## 0. 入口判断

先判断需求来自哪里：

- `launchpad_flow`：用户从 Velobase Launchpad 进入，已有交接 Prompt、产品概要、仓库和 Cloud 上下文。
- `direct_framework`：用户直接 clone 或打开 Harness，没有 Launchpad 的产品分析。

如果是 `launchpad_flow`，只校验交接内容，补问缺失的产品、计费、集成或 MVP 信息。

如果是 `direct_framework`，写代码前必须完整完成本 Phase 0。

## 1. 补齐必要问题

必须明确：

- 产品一句话描述。
- 目标用户：developer、creator、enterprise、consumer、marketplace、operator 或其他。
- 3-5 个核心用户故事。
- 商业模式：free、freemium、subscription、credits、hybrid、one-time 或 enterprise。
- AI 能力：chat、generation、analysis、agents、multimodal、document parsing 或其他。

## 2. 产品概要

实现前输出：

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

检查：

- 至少 3 个用户故事。
- 商业模式已知。
- 至少 1 个 AI 能力。
- 付费产品必须有支付 provider 或 `TBD`。

## 3. 领域决策

使用状态：`reuse_framework`、`configure`、`design_needed` 或 `not_needed`。

```yaml
domains:
  user: [auth_methods, roles_permissions, profile_fields]
  billing: [billing_model, sku_catalog, credit_consumption]
  operations: [analytics_events, notifications, lifecycle_touch]
  integrations: [auth_provider, payment_provider, email_provider, storage_provider, analytics_provider, ai_provider]
  non_functional: [security, deployment_mode, observability]
```

## 4. 用户域

决定认证方式、角色、Profile 扩展字段，以及 signup、activation、trial、paid、renewal、downgrade、churn、win-back 等生命周期。

只有确实需要时才输出自定义角色或用户扩展字段。

## 5. 计费域

选择 `none`、`credits`、`subscription`、`hybrid` 或 `enterprise`。

如果不是 `none`，定义 SKU 和积分规则：

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

如果实现支付代码，先读 `docs/zh-CN/integrations/payment/README.md`。

## 6. 运营与增长

只定义产品特有行为：

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

涉及 analytics、ads、email、Lark 或 Telegram 时阅读对应集成文档。

## 7. 集成决策

每项标记为 `enable`、`disable` 或 `later`：

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

## 8. 数据、API、事件

除非用户明确要求，不要修改框架保留的 auth、billing、order、payment、membership、promo、affiliate、touch、support 或 webhook log 表。

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

规则：

- 使用 `cuid()`、ownership 字段、timestamps、有限状态 enum 和 indexes。
- Router 保持薄层；Service 拥有业务逻辑。
- 副作用通过 `appEvents.emit()` 触发。

## 9. MVP 范围

实现前输出 MVP scope 和功能列表，并等待用户确认：

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

规则：

- `must_have_features` 要足够小，能交付第一版可运行 MVP。
- 暂缓的后台、支付、增长、自动化或高级工作放入 `explicitly_out_of_scope`。
- `first_demo_path` 描述用户看到产品价值的最短路径。
- 用户确认 scope 前不要实现。

## 10. 测试计划

```yaml
tests:
  - module: string
    service_unit: required | optional | none
    router_integration: required | optional | none
    worker: required | optional | none
    e2e: required | optional | none
```

写测试前阅读 `docs/zh-CN/ai/testing.md`。

## 11. 最终关卡

只有满足以下条件才继续：

- 产品概要完整。
- 领域决策已标记。
- 实体已列出。
- Router procedures 已规划。
- 集成决策已标记。
- 计费模型已决定，即使是 `none`。
- MVP scope、功能列表、明确不做事项和验收标准已由用户确认。
- 测试计划已列出。

然后继续阅读 `docs/zh-CN/ai/new-module.md`。
