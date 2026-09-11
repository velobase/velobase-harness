# Harness 模块目录

以下模块都围绕原 Harness 的页面、数据和业务组织。Admin 管理部署中包含的模块。代码可选和运行开关是两项要求；目前仍需处理根应用中的静态依赖，不能以目录或开关代替完成证明。

| 模块 | 类别 | 职责与依赖 | 原应用入口 / 功能 ID |
| --- | --- | --- | --- |
| 用户管理 | 基础 | 账号、权限、原 Admin | `/admin/users` |
| 商品 | 业务 | 商品目录、定价、发布 | `/admin/products` |
| 订单与支付 | 业务 | 订单、支付与退款；支付连接 | `/admin/orders` |
| 订阅 | 业务 | 原会员周期与权益；支付 | `src/modules/subscriptions` |
| 积分 | 业务 | 余额、发放、预扣和流水；账本连接 | `/admin/credits` |
| 兑换码活动 | 业务 | 活动、奖励、兑换记录 | `/admin/promo-codes` |
| 新人优惠 | 业务 | 资格、限时优惠；支付 | `newcomer-offers` |
| 每日奖励 | 业务 | 签到奖励；积分 | `daily-bonus` |
| 分享 | 业务 | 原会话发布、访问、撤销 | `/admin/sharing` |
| 邮件管理 | 业务 | 邮箱、工单、人工回复；无需模型 | `/admin/email` |
| AI 客服 | 业务扩展 | 邮件自动处理与建议；单独配置模型 | `ai-support` |
| 用户触达 | 业务 | 场景、模板、投递；邮件连接 | `/admin/touches` |
| 分销 | 业务 | 推荐、佣金、提现 | `/admin/affiliate/commissions` |
| 归因 | 业务 | 来源与转化；分析和广告连接 | `attribution` |
| AI 对话 | 业务 | 原会话、Agent、工具；模型连接 | `/chat` |
| 图片生成 | 业务 | 原任务与资产；生成服务、存储 | `image-generation` |
| 项目 | 业务 | 原文档和仓库组织 | `projects` |

| 技术模块 | 负责什么 |
| --- | --- |
| 认证、权限、Prisma、配置、日志 | 使用原框架基础设施 |
| Admin、国际化 | 使用原界面与翻译 |
| module-runtime | 模块清单、依赖和运行状态 |
| mailbox、email-transport | IMAP/MIME 与 SMTP 协议 |
| Worker、Redis、队列 | 异步任务与调度 |
| 支付、模型、分析和通知适配器 | 外部协议与凭据，独立于业务开关 |
| 存储 | 原有公有 / 私有资产存储 |

先[启动 Harness](./getting-started.md)，再在同一应用中[配置模块](./composition.md)。关闭新业务应保留历史、退款、取消和已接受任务的处理。
