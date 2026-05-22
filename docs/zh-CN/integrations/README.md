# 第三方集成

本目录包含 Velobase Harness 第三方集成的中文镜像文档。

## 分层

### 核心基础

| 集成 | 服务 | 用途 | 文档 |
| --- | --- | --- | --- |
| Auth | NextAuth + Google + GitHub | 注册、登录、会话 | [auth](./auth/README.md) |
| Email | Resend + SendGrid | 认证邮件和通知 | [email](./email/README.md) |
| Database | Prisma + PostgreSQL + Redis | 持久化、缓存、队列依赖 | [database](./database/README.md) |
| Payment | Stripe + LemonSqueezy + NowPayments | 订单、订阅、积分 | [payment](./payment/README.md) |
| Storage | R2 / S3 / OSS / GCS / MinIO | 上传和对象存储 | [storage](./storage/README.md) |
| Queue | Redis + BullMQ | 异步任务、重试、调度 | [queue](./queue/README.md) |

### 增长能力

| 集成 | 服务 | 用途 | 文档 |
| --- | --- | --- | --- |
| Analytics | PostHog | 事件和 Feature Flag | [analytics](./analytics/README.md) |
| Ads | Google Ads + Twitter Ads | 归因和转化回传 | [ads](./ads/README.md) |

### 安全与运营

| 集成 | 服务 | 用途 | 文档 |
| --- | --- | --- | --- |
| Security | Cloudflare Turnstile | CAPTCHA 和反滥用边界 | [security](./security/README.md) |

## 规则

- 产品代码调用框架封装，不直接调用 provider SDK。
- 核心流程通过 `appEvents.emit()` 发出领域事件。
- 可插拔模块订阅事件，禁用模块不应要求修改核心流程。
- 新集成应说明选型、架构、公开接口、配置、异常处理和 AI 规则。
