# 支付集成

支付覆盖 products、orders、subscriptions、credits、payment webhooks 和 entitlement delivery。

支持的 providers：

- Stripe：银行卡支付和订阅。
- LemonSqueezy：可选托管 Checkout 支付和订阅。
- NowPayments：可选加密货币支付。

## 规则

- 通过 `@/server/order/services/stripe/client` 的 `getStripe()` 获取 Stripe。
- 前端代码不要直接调用 payment SDK。
- 不要硬编码价格；查询 product data。
- 支付状态变化以 webhook 为准。
- 前端确认只作为补偿轮询。
- 权益发放走 fulfillment 和 billing services。
- 不要在 webhook handlers 中直接发放 credits。

## 配置

常见环境变量：

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_WEBHOOK_SECRET`
- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_IPN_SECRET`

新增支付配置时，同步更新 `src/env.js`、`.env.example` 和 provider registration。

模块模式：

- `STRIPE_MODE=auto|off|on` 控制 Stripe provider 注册、webhook 处理和 Stripe 归属 workers。
- `LEMONSQUEEZY_MODE=auto|off|on` 控制 LemonSqueezy provider 注册和 webhook 处理。
- `NOWPAYMENTS_MODE=auto|off|on` 控制 NowPayments provider 注册、webhook 处理和 NowPayments 归属 workers。
- `PAYMENT_RECONCILIATION_MODE=auto|off|on` 控制支付对账报表；`auto` 当前要求 Stripe 或 NowPayments 之一启用，并且 Lark 启用。

## Workers

Payment 归属的 worker 从 `src/workers/integrations/payment.ts` 注册。

| Worker                      | 归属                          | 启用条件                                                                       |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| `order-compensation`        | Stripe / NowPayments 支付补偿 | Stripe 或 NowPayments 启用                                                     |
| `subscription-compensation` | Stripe 订阅补偿               | Stripe 启用                                                                    |
| `payment-reconciliation`    | Payment 对账 + Lark 通知投递  | Stripe 或 NowPayments 启用且 Lark 启用，除非 `PAYMENT_RECONCILIATION_MODE=off` |

`payment-reconciliation` 不是独立的 Lark 集成。Lark 只是支付对账功能的通知渠道。

支付 workers 通过模块 `WorkerContribution` 暴露，`src/workers/start.ts` 从模块 catalog 收集。

## Webhooks 与幂等

- 处理前验证 webhook signatures。
- 适用时存储或检查 provider event IDs。
- 权益发放必须幂等。
- Worker compensation 要可安全重试，不能重复发放 credits。

## 测试

管理员支付诊断入口位于 `/dashboard` 的模块状态面板：

- Stripe 模块配置就绪后会变绿，点击后打开测试弹窗，覆盖 checkout creation、payment confirmation polling、order/payment listing、balance checks、subscription status 和 saved-card checks。
- LemonSqueezy 模块配置就绪后会变绿，点击后打开同一套支付测试弹窗，可创建 LemonSqueezy Checkout 并查询共享支付记录。若产品 metadata 没有 LemonSqueezy variant ID，本地测试可使用 `LEMONSQUEEZY_TEST_VARIANT_ID` 和 `LEMONSQUEEZY_TEST_SUBSCRIPTION_VARIANT_ID` 作为兜底。

支付变更需测试：

- Checkout creation。
- Webhook signature rejection。
- Successful entitlement delivery。
- Duplicate webhook behavior。
- 涉及 refund、renewal 或 subscription state transitions 时覆盖对应场景。
