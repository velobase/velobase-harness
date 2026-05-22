# 支付集成

支付覆盖 products、orders、subscriptions、credits、payment webhooks 和 entitlement delivery。

支持的 providers：

- Stripe：银行卡支付和订阅。
- NowPayments：可选加密货币支付。
- LemonSqueezy：Merchant of Record checkout 和订阅。

## 架构

支付 provider 通过 order provider 层接入：

- `src/server/order/providers/types.ts` 定义 `PaymentAdapter` 契约、`CheckoutRequest/Response` 和 `WebhookEvent` 类型。
- `src/server/order/providers/registry.ts` 按 gateway name 注册和解析 adapter。
- `src/server/order/services/init-providers.ts` 根据环境变量注册已配置的 adapter。
- `src/server/order/services/checkout.ts` 负责 order/payment 创建，并调用 adapter checkout 方法。
- `src/server/order/services/webhook-pipeline.ts` 通过 adapter 解析 webhook，归一化为 `WebhookEvent`，然后分发给独立的事件处理器。
- `src/server/order/services/webhook-handlers/` 包含各事件处理器：`payment-succeeded`、`payment-failed`、`payment-refunded`、`subscription-renewed`、`subscription-updated`、`subscription-canceled`、`cashflow`。
- `src/server/order/services/webhook-route-handler.ts` 提供统一的 webhook route handler。
- `src/server/fulfillment/**` 负责成功支付后的权益和 credits 发放。

Adapter 应该把平台细节隐藏在 `PaymentAdapter` 后面。Product、order、membership 和 fulfillment services 不应直接 import provider SDK。

## Adapter 契约

每个 adapter 实现 `PaymentAdapter` 接口：

- `createCheckout(params)`：一次性和订阅购买统一入口（由 `params.mode` 区分）。
- `parseWebhook(req)`：验证签名并将 provider 原始事件归一化为 `WebhookEvent[]`。
- 可选 `confirmPayment(checkoutId)`：用于 webhook 延迟补偿轮询。
- 可选 `expireCheckout(checkoutId)`：当 provider 支持 hosted checkout 过期时使用。
- 可选 `ensureCustomer(userId, email?)`：对需要 customer 对象的 provider（如 Stripe）。

`parseWebhook` 返回标准化 `type` 的 `WebhookEvent` 数组：

- `payment.succeeded`、`payment.failed`、`payment.refunded`
- `subscription.activated`、`subscription.renewed`、`subscription.payment_failed`
- `subscription.updated`、`subscription.canceled`
- `cashflow`、`ignored`

每个 adapter 将 provider 特有事件映射到这些标准化类型。Webhook pipeline 和事件处理器完全与 provider 无关。

## 定价

所有价格和订阅周期存储在数据库中，不在支付代码里硬编码。

- `Product.price`（美分）、`Product.originalPrice`、`Product.interval`（week/month/year）。
- `ProductPrice` 支持多币种定价（USD/EUR/GBP/CHF/AUD），按用户所在国自动匹配。
- `SubscriptionPlan.interval`、`intervalCount`、`creditsPerPeriod` 控制订阅计费周期和积分发放。
- `ProductCreditsPackage.creditsAmount` 定义一次性积分包数量。

Checkout 从数据库读取价格后传给 adapter。Stripe 使用动态 `price_data`（无需预先创建 Stripe 商品）。修改数据库中的价格后，下一次下单即生效。

产品配置通过 `prisma/seed-products.ts`（初始化的单一事实来源）和 Admin API（`updateProduct` 可改价格、状态、试用设置）管理。

## 规则

- 只在 Stripe-specific 代码中通过 `@/server/order/services/stripe/client` 的 `getStripe()` 获取 Stripe。
- 前端代码不要直接调用 payment SDK。
- 不要硬编码价格；查询 product data。
- 支付状态变化以 webhook 为准。
- 前端确认只作为补偿轮询。
- 权益发放走 fulfillment 和 billing services。
- 不要在 webhook handlers 中直接发放 credits。
- Provider-specific customer、checkout、invoice 和 webhook parsing 应留在 adapter modules 中。
- 新 adapter 必须通过 `resolvePaymentGateway()` 和 adapter registry 选择。

## 三方组件配置方式

支付 provider 是可选三方组件，不需要同时接入所有平台。只配置你要启用的 provider；`src/server/order/services/init-providers.ts` 会根据该 provider 所需环境变量是否齐全来注册对应 adapter。

新增支付配置时，同步更新 `src/env.js`、`.env.example`、adapter registration 和对应 provider 文档。

## Provider 选择

Gateway resolution 位于 `src/server/order/services/resolve-gateway.ts`。

优先级：

1. Checkout input 显式传入的 `gateway`。
2. `FORCE_PAYMENT_GATEWAY`。
3. 用户 payment preference，且对应 adapter 已注册。
4. 默认 `STRIPE`。

前端入口只有在用户显式选择支付方式时才应传 gateway；否则应让后端 resolver 决定。

`FORCE_PAYMENT_GATEWAY` 仅用于本地测试，可强制为 `STRIPE`、`NOWPAYMENTS` 或 `LEMONSQUEEZY`。

## Stripe

Stripe 是可选的银行卡支付和订阅 provider。启用 Stripe 时配置：

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Webhook 指向 `/api/webhooks/stripe`。Stripe 支持 `confirmPayment()` 轮询补偿，因此本地测试时即使 webhook 延迟，成功页也可以通过 Stripe Checkout Session 主动确认支付状态。

## NowPayments

NowPayments 是可选的加密货币支付 provider。启用 NowPayments 时配置：

```env
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
NOWPAYMENTS_PAY_CURRENCY=usdttrc20
```

IPN/webhook 指向 `/api/webhooks/nowpayments`。`NOWPAYMENTS_PAY_CURRENCY` 是默认收款币种，不配置时使用代码默认值。

## LemonSqueezy

LemonSqueezy 作为 Merchant of Record provider 使用。它适合更简单的全球 SaaS 收款场景，尤其是希望由支付 provider 处理税费收取和申报的 indie developer 或小团队。

### Variant ID 配置

与 Stripe（通过 `price_data` 动态创建价格）不同，LemonSqueezy 要求先在 LemonSqueezy 后台创建 product 和 variant。本地数据库的 product 必须通过 `Product.metadata` 引用对应的 LemonSqueezy variant ID。

这意味着**需要同步维护两个数据源**：

1. **本地数据库**：`Product.price`、`Product.name`、`Product.interval` 等。
2. **LemonSqueezy 后台**：product name、variant 和定价配置。

框架使用 `custom_price` 覆盖 LemonSqueezy variant 的价格，所以**实际扣款金额始终以本地数据库为准**。Variant ID 只作为 checkout 入口标识。

### 扣款金额来源

LemonSqueezy variant 负责告诉 LemonSqueezy 使用哪个 hosted checkout/product，但它不是框架内的价格来源。创建 checkout 时，adapter 会把本地订单金额作为 `custom_price` 传给 LemonSqueezy：

- 一次性积分包金额来自 `Product.price` / `ProductPrice`。
- 订阅金额来自对应 subscription product 的本地价格。
- LemonSqueezy 后台 variant 的价格会被 `custom_price` 覆盖。

因此，开发者调整商品价格时应优先更新本地数据库或 Admin 产品配置；LemonSqueezy variant 价格只需要保持为可用的 checkout 入口。

支持的 metadata key（任选其一即可）：

- `lemonsqueezy.variantId`（嵌套对象）
- `lemonsqueezy.variant_id`（嵌套对象）
- `lemonsqueezyVariantId`（扁平 key）
- `lemonsqueezy_variant_id`（扁平 key）
- `lemonSqueezyVariantId`（扁平 key）

示例 `Product.metadata`：

```json
{
  "lemonsqueezy": {
    "variantId": "123456"
  }
}
```

### 配置步骤

1. 创建 LemonSqueezy store。
2. 在 LemonSqueezy 中创建 product 和 variant。Variant 价格无需与本地数据库一致（会被 `custom_price` 覆盖）。
3. 使用上述支持的 key 之一，将 variant ID 写入本地 product metadata。
4. 配置 LemonSqueezy 环境变量：

```env
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_TEST_MODE=true
```

本地 Dashboard smoke test 可选配置：

```env
LEMONSQUEEZY_TEST_VARIANT_ID=
LEMONSQUEEZY_TEST_SUBSCRIPTION_VARIANT_ID=
```

生产环境应通过 `Product.metadata` 配置真实 variant ID，不应依赖测试 fallback。

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

Checkout 创建使用 LemonSqueezy `POST /v1/checkouts`。Adapter 通过 `checkout_data.custom` 传递本地 `orderId` 和 `paymentId`；LemonSqueezy 会在 webhook 的 `meta.custom_data` 中返回这些字段，用于 webhook pipeline 映射本地 payment row。

Webhook 验签使用 `X-Signature` 和 `LEMONSQUEEZY_WEBHOOK_SECRET` 做 HMAC-SHA256。

### 本地 Webhook 测试

本地测试支付成功、订阅激活、续费或取消时，需要让 LemonSqueezy 能访问本地 Next.js webhook。推荐使用 ngrok：

```bash
ngrok http 3000
```

拿到公网 HTTPS 地址后，例如 `https://example.ngrok-free.app`，更新本地 `.env` 并重启 dev server：

```env
APP_URL=https://example.ngrok-free.app
NEXTAUTH_URL=https://example.ngrok-free.app
AUTH_URL=https://example.ngrok-free.app
LEMONSQUEEZY_WEBHOOK_SECRET=your-local-webhook-secret
```

在 LemonSqueezy dashboard 中配置 webhook：

```text
URL: https://example.ngrok-free.app/api/webhooks/lemonsqueezy
Signing secret: your-local-webhook-secret
```

Signing secret 必须与 `LEMONSQUEEZY_WEBHOOK_SECRET` 完全一致，否则 `X-Signature` 校验会失败，事件会被忽略或无法履约。若支付已经完成但本地没有状态变化，可以在 LemonSqueezy 后台重发 webhook，并检查本地 `PaymentWebhookLog`、ngrok inspector 和 dev server 日志。

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

Dashboard 页面的 Module Status > Payment 区域包含**支付测试**按钮，可打开交互式测试弹窗。支持：

- 选择支付提供商（仅已配置的 provider 可选）。
- 创建一次性和订阅 checkout（自动打开真实的测试支付页面）。
- 轮询确认支付状态。
- 查询订单、支付记录、积分余额和订阅状态。
- Provider 专属测试（Stripe 已保存银行卡、NowPayments 支持币种）。

支付变更需测试：

- Checkout creation。
- Webhook signature rejection。
- Successful entitlement delivery。
- Duplicate webhook behavior。
- 涉及 refund、renewal 或 subscription state transitions 时覆盖对应场景。

Adapter 变更还需测试：

- 必要环境变量存在或缺失时的 adapter registration。
- 显式 checkout input、`FORCE_PAYMENT_GATEWAY` 和用户偏好下的 gateway resolution。
- 无效签名的 webhook rejection。
- 一次性购买 webhook 到 `Payment` 和 `Order` 的映射。
- 订阅首购、续费、取消、过期和支付失败行为。
- 集成 smoke test 使用隔离的本地 PostgreSQL / Redis Docker Compose project，结束后用 `down -v` 清理。
