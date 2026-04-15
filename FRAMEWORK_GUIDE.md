# AI SaaS Framework — 开发指南

本文档指导基于本框架开发新的 AI SaaS 产品。涵盖架构概览、快速启动、代码边界划分和分阶段 Checklist。

> **定位**：本文件面向开发者，说明"框架是什么、怎么用、从模板到产品的路径"。  
> AI 编码规则（禁止/必须） → 见 `[AGENTS.md](./AGENTS.md)`  
> API 三区制与编码约定 → 见 `[docs/conventions/api.md](./docs/conventions/api.md)`  
> 第三方集成详细文档 → 见 `[docs/integrations/](./docs/integrations/)`  
> 集成梳理流程和进度 → 见 `[docs/integration-guide.md](./docs/integration-guide.md)`  
> 框架内置功能 → 见 `[docs/features/](./docs/features/)`

---

## 目录

1. [框架架构概览](#1-框架架构概览)
2. [最小配置快速启动](#2-最小配置快速启动)
3. [框架 vs 业务 — 代码边界清单](#3-框架-vs-业务--代码边界清单)
4. [从框架到生产应用 — 分阶段 Checklist](#4-从框架到生产应用--分阶段-checklist)
5. [关键架构决策说明](#5-关键架构决策说明)

---

## 1. 框架架构概览

### 技术栈


| 层级      | 技术                                 |
| ------- | ---------------------------------- |
| 前端框架    | Next.js 15 (App Router) + React 19 |
| API 层   | tRPC 11（类型安全的端到端 API）              |
| 数据库 ORM | Prisma 6 + PostgreSQL              |
| 缓存 / 队列 | Redis + BullMQ                     |
| 认证      | NextAuth v5（支持 OAuth + 邮箱）         |
| 样式      | Tailwind CSS v4                    |
| 包管理     | pnpm                               |


### 分层架构

```mermaid
graph TB
  subgraph client [客户端层]
    pages[Next.js 页面 / App Router]
    ui[UI 组件库]
    trpcClient[tRPC 客户端]
  end

  subgraph api [API 层]
    trpcServer[tRPC Server / Routers]
    webhooks[Webhook 处理器]
    authApi[NextAuth 端点]
  end

  subgraph infra [基础设施层 — 框架提供，一般不动]
    authCore[认证系统 NextAuth]
    db[Prisma + PostgreSQL]
    redis[Redis 客户端]
    queue[BullMQ 队列]
    storage[对象存储抽象]
    email[邮件服务抽象]
    ratelimit[限流]
    adminFrame[Admin 框架]
  end

  subgraph business [业务层 — 按产品定制]
    product[产品 / 定价定义]
    aiFeature[核心 AI 功能模块]
    billing[计费与积分]
    payment[支付渠道集成]
    touch[用户触达 / 生命周期]
    support[客服集成]
    affiliate[联盟推广]
  end

  subgraph workers [Worker 进程 — 独立部署]
    jobProcessors[BullMQ Processors]
    scheduledJobs[定时任务]
  end

  client --> api
  api --> infra
  api --> business
  business --> infra
  workers --> infra
  workers --> business
```



### 请求数据流

```mermaid
sequenceDiagram
  participant Browser
  participant NextJS
  participant tRPC
  participant Service
  participant DB
  participant Redis

  Browser->>NextJS: HTTP 请求
  NextJS->>tRPC: 路由到对应 procedure
  tRPC->>tRPC: 认证鉴权 + 限流检查
  tRPC->>Service: 调用业务 Service
  Service->>DB: Prisma 查询
  Service->>Redis: 缓存 / 队列操作
  Service-->>tRPC: 返回结果
  tRPC-->>Browser: 类型安全响应
```



---

## 2. 最小配置快速启动

### 必需环境变量

```bash
# 认证
AUTH_SECRET=         # 运行 `npx auth secret` 生成
AUTH_URL=http://localhost:3000

# 数据库
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/mydb

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# 至少配置一个 OAuth 登录方式
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

### 本地启动步骤

```bash
pnpm install                # 安装依赖
cp .env.example .env        # 复制模板，填入必需变量
docker compose up -d        # 启动 PostgreSQL + Redis
pnpm db:push                # 同步 schema，创建所有数据表
pnpm db:seed                # 写入种子数据（Agent、产品、测试账号）
pnpm dev                    # 主应用 http://localhost:3000
pnpm worker:dev             # 新终端，Worker 服务 http://localhost:3001
```

**seed 写入的内容：**

- 系统 Agent（AI 助手、写作等默认 Agent）
- 产品 SKU（订阅档位 + 积分包）
- 密码登录测试账号（详见下方）
- 触达场景通知模板

**本地测试账号（密码登录）：**

白名单在 `src/server/auth/password-login-allowlist.ts`，默认包含：

| 邮箱 | 密码 | 说明 |
| --- | --- | --- |
| `testadmin@example.com` | `Testadmin2024!` | 测试用户（非管理员） |

设置管理员：在 `.env` 中配置 `ADMIN_EMAIL=your@email.com`，重跑 `pnpm db:seed` 即可。

> 详细说明见 [数据库文档](./docs/integrations/database/)

### 可选但推荐提前配置


| 功能   | 变量                                    | 详细文档                                                           |
| ---- | ------------------------------------- | -------------------------------------------------------------- |
| 文件上传 | `STORAGE_*` + `CDN_BASE_URL`          | `[docs/integrations/storage/](./docs/integrations/storage/)`   |
| 发送邮件 | `RESEND_API_KEY` / `SENDGRID_API_KEY` | `[docs/integrations/email/](./docs/integrations/email/)`       |
| 防机器人 | `TURNSTILE_*`                         | `[docs/integrations/security/](./docs/integrations/security/)` |


---

## 3. 框架 vs 业务 — 代码边界清单

### 框架层（不需要修改，直接复用）


| 路径                          | 说明                                                 |
| --------------------------- | -------------------------------------------------- |
| `src/env.js`                | 环境变量 Schema 统一入口（Zod 校验）                           |
| `src/server/db.ts`          | Prisma Client 单例                                   |
| `src/server/redis.ts`       | Redis 客户端单例（ioredis）                               |
| `src/server/ratelimit.ts`   | 基于 Redis 的请求限流                                     |
| `src/server/auth/config.ts` | NextAuth 配置（按需增减 provider）                         |
| `src/server/email/`         | 邮件发送抽象（Resend / SendGrid 自动切换）                     |
| `src/server/api/trpc.ts`    | tRPC 中间件（认证、限流）                                    |
| `src/server/order/`         | 订单状态机（通用，不与产品耦合）                                   |
| `src/server/features/`      | 框架内置功能（[详见](./docs/features/)）                     |
| `src/workers/`              | Worker 进程入口与调度框架（[详见](./docs/integrations/queue/)） |
| `src/components/ui/`        | 基础 UI 组件（shadcn/ui 风格）                             |
| `src/components/auth/`      | 登录相关组件                                             |
| `src/components/layout/`    | 全局布局组件                                             |


### 框架 + 配置层（复用引擎，替换配置）


| 路径                           | 需要定制的部分            |
| ---------------------------- | ------------------ |
| `src/server/billing/config/` | 积分包定义、消耗规则、订阅档位    |
| `src/server/touch/config/`   | 触达场景文案和触发条件        |
| `src/server/support/`        | 客服邮件账号、飞书/Lark 群配置 |
| `prisma/schema.prisma`       | 保留核心表，删除/替换业务相关表   |
| `src/app/admin/`             | 保留通用管理页，删除业务特定视图   |


### 业务层（完全替换为新产品逻辑）


| 路径                            | 替换说明                      |
| ----------------------------- | ------------------------- |
| `src/modules/<your-feature>/` | 按 `modules/example/` 结构创建 |
| `src/server/product/`         | 重新定义产品 SKU、定价结构           |
| `src/app/(feature)/`          | 核心功能前端页面                  |
| `src/app/pricing/`            | 基于新产品定价重写                 |
| `src/app/page.tsx`            | 首页完全替换                    |


### Prisma Schema 边界

```
保留（框架通用表）          替换（业务专用表）
─────────────────────    ──────────────────────────
User                      （你的业务 Model）
Account / Session
BillingAccount
BillingTransaction
Order / OrderItem
Membership / MembershipCycle
PromoCode / PromoUsage
AffiliateAccount
Touch / TouchLog
SupportTicket
```

---

## 4. 从框架到生产应用 — 分阶段 Checklist

### 阶段一：基础运行

> 目标：`pnpm dev` 跑起来，可以注册登录

- 配置 `DATABASE_URL` + `REDIS_HOST` + `AUTH_SECRET`
- 配置至少一个 OAuth 登录（[认证文档](./docs/integrations/auth/)）
- `docker compose up -d` → `pnpm db:migrate` → `pnpm dev`
- 确认访问 `/auth/signin` 可以登录

### 阶段二：存储与邮件

> 目标：用户可以上传文件，系统可以发送邮件

- 配置对象存储（[存储文档](./docs/integrations/storage/)）
- 配置邮件服务（[邮件文档](./docs/integrations/email/)）
- 验证域名 SPF / DKIM / DMARC

### 阶段三：定义产品与定价

> 目标：明确卖什么、卖多少钱

- 确定产品模型：一次性购买 / 订阅 / 积分包
- 在 `src/server/product/` 定义 SKU
- 在 `src/server/billing/config/` 配置积分规则
- 在 `prisma/schema.prisma` 中添加业务 Model，运行 `pnpm db:migrate`

### 阶段四：实现核心 AI 功能

> 目标：替换模板的示例逻辑，实现你的核心 AI 功能

- 在 `src/modules/<name>/` 下创建功能模块（参考 `modules/example/`）
- 异步功能在 `src/workers/processors/` 下新建 Processor（[队列文档](./docs/integrations/queue/)）
- 构建前端 UI 页面，替换首页

### 阶段五：支付集成

> 目标：完整的购买 → 积分发放 → 使用扣减链路可用

- 选择支付渠道，配置 env 和 Webhook（[支付文档](./docs/integrations/payment/)）
- 测试完整流程：选择产品 → 支付 → Webhook → 积分到账
- 测试退款、订阅续费

### 阶段六：用户触达

> 目标：关键节点自动触达用户

- 在 `src/server/touch/config/` 配置触达场景
- 编写邮件模板（`src/server/email/templates/`）
- 在 Worker 中配置定时调度

### 阶段七：运营后台与通知

> 目标：内部运营管理

- 配置 Admin 权限，添加必要视图
- 配置运营通知渠道（Lark / Telegram）
- 配置 Turnstile 防机器人（[安全文档](./docs/integrations/security/)）

### 阶段八：生产部署

> 目标：在生产环境稳定运行

- 构建 Docker 镜像（Web + Worker 分别部署）
- 配置生产级数据库（[数据库文档](./docs/integrations/database/)）
- 配置 SSL、CI/CD、健康检查告警
- Worker `/health` + `/ready` 端点已内置

### 阶段九：安全加固

> 目标：符合基本生产安全标准

- 生产 `AUTH_SECRET` 使用强随机密钥
- 开发 key 与生产 key 完全分离
- 审查限流配置（`src/server/ratelimit.ts`）
- Webhook 端点验证签名
- 数据库连接使用 SSL

---

## 5. 关键架构决策说明

### 积分模型

所有 AI 功能消耗以**积分（Credits）**为单位，与产品定价解耦：

```
用户购买产品 → 获得积分 → AI 操作消耗积分 → 积分耗尽需补充
```

积分管理通过 Velobase Billing SDK 云端处理，本地不存储余额。

### 支付网关路由

系统通过 `resolvePaymentGateway()` 自动选择支付渠道（详见[支付文档](./docs/integrations/payment/)）。  
开发测试可用 `FORCE_PAYMENT_GATEWAY` 强制指定。

### Worker 双进程架构

```
主服务（Next.js :3000）  ── queue.add() ──▶  Worker 进程（BullMQ :3001）
  处理 HTTP 请求                                  消费队列任务
  不阻塞等待耗时操作                               调用 AI API → 存储结果
```

Worker 独立部署、可单独扩缩容、故障不影响主服务。详见[队列文档](./docs/integrations/queue/)。

### 多环境行为差异


| `NEXT_PUBLIC_APP_ENV` | 环境   | 典型差异            |
| --------------------- | ---- | --------------- |
| `dev`                 | 本地开发 | 关闭部分限流，详细错误信息   |
| `staging`             | 测试环境 | 测试支付 key，不发真实邮件 |
| `prod`                | 生产环境 | 全部限流开启，使用真实支付   |


### tRPC 类型安全

```
1. 在 src/server/api/routers/<feature>.ts 定义 procedure
2. 在 src/server/api/root.ts 挂载 router
3. 前端直接 api.<feature>.<procedure>.useQuery() — 类型自动推断
```

