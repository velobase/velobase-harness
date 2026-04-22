# 框架内置功能

本目录管理框架提供的**内置功能模块**，区别于 `docs/integrations/` 中的第三方集成和 `src/server/modules/` 中的可插拔模块。

## 三类模块的区别


| 维度   | 第三方集成（integrations）         | 可插拔模块（modules）                   | 内置功能（features）          |
| ---- | --------------------------- | --------------------------------- | ----------------------- |
| 定义   | 对外部 API/SDK 的封装             | 通过事件总线订阅的可选功能                    | 框架自身实现的通用业务逻辑           |
| 依赖   | 需要 API Key / 外部服务           | 需要 API Key 或通过 env 开关            | 仅依赖框架已有的集成能力            |
| 启停   | 始终存在（核心基础）                  | 环境变量驱动，自动启停                      | 需要时调用、不需要时不引用           |
| 示例   | Stripe、NextAuth、Prisma      | PostHog、Google Ads、Lark、Affiliate | 每日签到赠送、新用户引导、积分过期清理     |
| 代码位置 | 各自目录                        | `src/server/modules/<name>.ts`    | `src/server/features/<name>/` |
| 文档位置 | `docs/integrations/<name>/` | `FRAMEWORK_GUIDE.md` 第 5 章        | `docs/features/<name>/` |


## 设计原则

1. **可插拔** — 每个功能独立，需要时调用、不需要时不引用，不影响核心流程
2. **基于集成** — 内置功能组合使用已有的第三方集成（如 Velobase Billing + Auth）
3. **AI 友好** — 逻辑集中在单文件中，常量和策略函数直接写在代码里，AI 一次读完即可理解和修改
4. **无配置文件** — 不走 env var 或独立配置文件，所有可调参数就是代码中的常量

## 功能清单

### 内置功能（`src/server/features/`）

| 功能 | 说明 | 依赖 | 对应 API | 状态 |
| --- | --- | --- | --- | --- |
| [每日签到赠送](./daily-bonus/) | 每日首次访问自动赠送积分，递减衰减 | Velobase Billing + Auth | — | ✅ 已实现 |
| [注册反滥用](./anti-abuse/) | 检测白嫖/多号滥用并回收积分 | Velobase Billing + Auth + DB | — | ✅ 已实现 |
| [CDN 适配](./cdn-adapters/) | 自动感知部署环境（IP/国家/Flexible SSL） | 无（仅依赖 HTTP 请求头） | — | ✅ 已实现 |
| 优惠码 | 优惠码验证与兑换 | Order + Billing | `promo.*` | ⏳ 待整理 |

### 可插拔模块（`src/server/modules/`）

以下功能已迁移为可插拔模块，通过事件总线与核心流程解耦，按需启停：

| 模块 | 说明 | 启停方式 | 状态 |
| --- | --- | --- | --- |
| 联盟推广 | 邀请返佣、佣金提现、积分兑换 | `DISABLE_AFFILIATE=true` 禁用 | ✅ 模块化 |
| 用户触达 | 订阅取消提醒等生命周期管理 | `DISABLE_TOUCH=true` 禁用 | ✅ 模块化 |
| PostHog | 支付事件分析采集 | 配置 `POSTHOG_API_KEY` 启用 | ✅ 模块化 |
| Google Ads | 离线转化回传 | 配置 Google Ads Key 启用 | ✅ 模块化 |
| Lark | 运营通知（支付/异常） | 配置 `LARK_APP_ID` 启用 | ✅ 模块化 |
| Telegram | Bot 通知、Stars 支付 | 配置 `TELEGRAM_BOT_TOKEN` 启用 | ✅ 模块化 |
| NowPayments | 加密货币支付 | 配置 `NOWPAYMENTS_API_KEY` 启用 | ✅ 模块化 |
| AI Chat | AI 对话、Agent 能力 | 配置任一 LLM API Key 启用 | ✅ 模块化 |

详见 [FRAMEWORK_GUIDE.md — 可插拔模块架构](../FRAMEWORK_GUIDE.md#5-可插拔模块架构)。


## 文档规范

每个内置功能的文档应包含：

```
docs/features/<name>/
└── README.md    # 功能说明 + 代码位置 + AI 修改指南
```

文档内容：

1. **功能说明** — 做什么、为什么有用
2. **依赖** — 需要哪些集成能力已就绪
3. **代码位置** — 实现文件路径
4. **AI 修改指南** — 哪些常量可调、哪些函数可改、哪些部分一般不动，并给出常见修改示例

