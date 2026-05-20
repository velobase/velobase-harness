# 支付集成

支付覆盖 products、orders、subscriptions、credits、payment webhooks 和 entitlement delivery。

支持的 providers：

- Stripe：银行卡支付和订阅。
- NowPayments：可选加密货币支付。
- LemonSqueezy：Merchant of Record checkout 和订阅。

## 架构

支付 provider 通过 order provider 层接入：

- `src/server/order/providers/types.ts` 定义 `PaymentProvider` 契约。
- `src/server/order/providers/registry.ts` 按 gateway name 注册和解析 provider。
- `src/server/order/services/init-providers.ts` 注册已配置的 providers。
- `src/server/order/services/checkout.ts` 负责 order/payment 创建，并调用 provider checkout 方法。
- `src/server/order/services/handle-webhooks.ts` 负责 provider-neutral webhook 编排、支付状态更新、订阅续费处理和履约触发。
- `src/server/fulfillment/**` 负责成功支付后的权益和 credits 发放。

Provider 应该把平台细节隐藏在 `PaymentProvider` 后面。Product、order、membership 和 fulfillment services 不应直接 import provider SDK。

## Provider 契约

每个 provider 实现：

- `createPayment()`：一次性购买。
- `createSubscription()`：订阅购买。
- `handlePaymentWebhook()`：一次性支付或首购 checkout 事件。
- `handleSubscriptionWebhook()`：订阅生命周期和续费事件。
- 可选 `confirmPayment()`：用于 webhook 延迟补偿。
- 可选 `expireCheckoutSession()`：当 provider 支持 hosted checkout 过期时使用。

Provider 结果应返回标准化 ID：

- `gatewayTransactionId`：provider payment、order、invoice、payment intent 或等价现金流 ID。
- `gatewaySubscriptionId`：provider subscription ID。
- `gatewayCheckoutId`：hosted checkout/session ID。
- `providerExtra`：需要持久化到 `Payment.extra` 的 provider-specific metadata。

当可以在 provider result 中增加标准化字段时，不要让通用 order 或 fulfillment 代码解析 provider raw payload。

## 规则

- 只在 Stripe-specific 代码中通过 `@/server/order/services/stripe/client` 的 `getStripe()` 获取 Stripe。
- 前端代码不要直接调用 payment SDK。
- 不要硬编码价格；查询 product data。
- 支付状态变化以 webhook 为准。
- 前端确认只作为补偿轮询。
- 权益发放走 fulfillment 和 billing services。
- 不要在 webhook handlers 中直接发放 credits。
- Provider-specific customer、checkout、invoice 和 webhook parsing 应留在 provider modules 中。
- 新 provider 必须通过 `resolvePaymentGateway()` 和 provider registry 选择。

## 配置

常见环境变量：

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_IPN_SECRET`
- `NOWPAYMENTS_PAY_CURRENCY`
- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_WEBHOOK_SECRET`
- `LEMONSQUEEZY_TEST_MODE`
- `FORCE_PAYMENT_GATEWAY`

新增支付配置时，同步更新 `src/env.js`、`.env.example` 和 provider registration。

`FORCE_PAYMENT_GATEWAY` 仅用于本地测试，可强制为 `STRIPE`、`NOWPAYMENTS` 或 `LEMONSQUEEZY`。

## Provider 选择

Gateway resolution 位于 `src/server/order/services/resolve-gateway.ts`。

优先级：

1. Checkout input 显式传入的 `gateway`。
2. `FORCE_PAYMENT_GATEWAY`。
3. 用户 payment preference，且对应 provider 已注册。
4. 默认 `STRIPE`。

前端入口只有在用户显式选择支付方式时才应传 gateway；否则应让后端 resolver 决定。

## LemonSqueezy

LemonSqueezy 作为 Merchant of Record provider 使用。它适合更简单的全球 SaaS 收款场景，尤其是希望由支付 provider 处理税费收取和申报的 indie developer 或小团队。

必要配置：

1. 创建 LemonSqueezy store。
2. 在 LemonSqueezy 中创建 products 和 variants。
3. 将 variant ID 写入本地 product metadata。支持的 metadata keys 包括：
   - `lemonsqueezyVariantId`
   - `lemonsqueezy_variant_id`
   - `lemonsqueezy.variantId`
   - `lemonsqueezy.variant_id`
4. 配置 `LEMONSQUEEZY_API_KEY`、`LEMONSQUEEZY_STORE_ID` 和 `LEMONSQUEEZY_WEBHOOK_SECRET`。
5. 在 LemonSqueezy 配置 webhook，指向 `/api/webhooks/lemonsqueezy`。

推荐订阅的 webhook events：

- `order_created`
- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_resumed`
- `subscription_expired`
- `subscription_payment_success`
- `subscription_payment_failed`
- `subscription_payment_recovered`

Checkout 创建使用 LemonSqueezy `POST /v1/checkouts`。Provider 通过 `checkout_data.custom` 传递本地 `orderId` 和 `paymentId`；LemonSqueezy 会在 webhook 的 `meta.custom_data` 中返回这些字段，用于映射本地 payment row。

Webhook 验签使用 `X-Signature` 和 `LEMONSQUEEZY_WEBHOOK_SECRET` 做 HMAC-SHA256。

## Stripe 与 LemonSqueezy

当应用需要细粒度 usage billing、复杂 metering、自定义支付方式控制或高级订阅生命周期控制时，优先使用 Stripe。

当 Merchant of Record 更重要，尤其是全球销售时希望减少税务合规负担，优先使用 LemonSqueezy。

不要假设 Stripe 订阅可以自动迁移到 LemonSqueezy。已有 active subscription 应保留在当前 gateway，或通过明确的迁移 / 取消后重新购买流程处理。

## Webhooks 与幂等

- 处理前验证 webhook signatures。
- 适用时存储或检查 provider event IDs。
- 权益发放必须幂等。
- Worker compensation 要可安全重试，不能重复发放 credits。
- 续费处理应使用 provider 标准化后的 invoice/payment ID 作为幂等键。
- 如果 provider 对同一个业务动作发送多个事件，只允许一条路径触发履约。

## 测试

支付变更需测试：

- Checkout creation。
- Webhook signature rejection。
- Successful entitlement delivery。
- Duplicate webhook behavior。
- 涉及 refund、renewal 或 subscription state transitions 时覆盖对应场景。

Provider 变更还需测试：

- 必要环境变量存在或缺失时的 provider registration。
- 显式 checkout input、`FORCE_PAYMENT_GATEWAY` 和用户偏好下的 gateway resolution。
- 无效签名的 webhook rejection。
- 一次性购买 webhook 到 `Payment` 和 `Order` 的映射。
- 订阅首购、续费、取消、过期和支付失败行为。
- 集成 smoke test 使用隔离的本地 PostgreSQL / Redis Docker Compose project，结束后用 `down -v` 清理。
