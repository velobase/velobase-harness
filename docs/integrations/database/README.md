# 数据库（Database）集成文档

> 第三方集成梳理 · 第 3 站

## 1. 选型

### 技术栈


| 组件    | 技术            | 说明                          |
| ----- | ------------- | --------------------------- |
| 关系数据库 | PostgreSQL 16 | 主数据存储                       |
| ORM   | Prisma 6      | 类型安全的数据库操作                  |
| 缓存/队列 | Redis 7       | BullMQ 任务队列 + Rate Limiting |


### 部署模式

框架支持两种模式，代码完全相同，只是 `.env` 连接信息不同：


| 模式            | 适用场景              | PostgreSQL                | Redis                 |
| ------------- | ----------------- | ------------------------- | --------------------- |
| **Docker 自建** | 本地开发 / VPS 部署     | `docker-compose.yml` 一键启动 | 同左                    |
| **云服务商**      | Serverless / 托管部署 | Neon / Supabase / RDS     | Upstash / ElastiCache |


## 2. 架构设计

### 代码结构

```
prisma/
├── schema.prisma         # 数据模型定义（唯一的 schema 来源）
├── seed.ts               # 种子数据入口
└── seed-*.ts             # 各模块种子数据

src/server/
├── db.ts                 # PrismaClient 单例（全局唯一入口）
├── redis.ts              # Redis 单例（ioredis，含构建期 stub）
└── ratelimit.ts          # Rate Limiter（基于 Redis）

docker-compose.yml        # 本地开发：PG + Redis 一键启动
```

### 设计要点

- **PrismaClient 单例**：开发模式下挂载到 `globalThis` 防止热重载创建多个连接
- **Redis 懒连接**：`lazyConnect: true`，只在实际发命令时才连接
- **构建期安全**：`next build` 时 Redis 导出 stub，避免构建环境连接失败

## 3. 接口定义

### 数据库操作（from `@/server/db`）

```typescript
import { db } from "@/server/db";

// Prisma 提供完整的类型安全 API
await db.user.findUnique({ where: { id } });
await db.user.create({ data: { email, name } });
await db.order.findMany({ where: { userId }, take: 20 });
```

### Redis 操作（from `@/server/redis`）

```typescript
import { redis } from "@/server/redis";

await redis.set("key", "value");
await redis.get("key");
await redis.setex("key", 300, "value"); // 带 TTL
```

### 功能边界

**数据库模块做的事：**

- 提供 PrismaClient 和 Redis 单例
- 管理连接生命周期（单例、懒连接、构建期 stub）

**数据库模块不做的事：**

- 不定义业务查询逻辑（由各模块的 service 层负责）
- 不管理数据迁移流程（由开发者运行 `prisma db push` 或 `prisma migrate`）

## 4. 配置

### 环境变量


| 变量               | 必填  | 说明               | 示例                                        |
| ---------------- | --- | ---------------- | ----------------------------------------- |
| `DATABASE_URL`   | 是   | PostgreSQL 连接字符串 | `postgresql://user:pass@host:5432/dbname` |
| `REDIS_HOST`     | 是   | Redis 主机         | `127.0.0.1`                               |
| `REDIS_PORT`     | 是   | Redis 端口         | `6379`                                    |
| `REDIS_PASSWORD` | 否   | Redis 密码         | —                                         |
| `REDIS_USER`     | 否   | Redis 用户名        | —                                         |
| `REDIS_DB`       | 否   | Redis 数据库编号      | `0`                                       |


### 模式 A：Docker 自建（推荐本地开发）

**第 1 步：配置 `.env`**

```env
DATABASE_URL="postgresql://velobase:velobase@localhost:5432/velobase"
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

**第 2 步：首次初始化**（启动容器 → 建表 → 写入种子数据）

```bash
docker compose up -d          # 启动 PostgreSQL + Redis
pnpm db:push                  # 同步 prisma/schema.prisma 到数据库（创建所有表）
pnpm db:seed                  # 写入种子数据（Agent、Product、测试账号）
```

**第 3 步：日常启动**（已有数据，schema 有变更时）

```bash
docker compose up -d          # 启动容器
pnpm db:push                  # 增量同步 schema 变更（不清空数据）
```

**完全重置**（清空所有数据，从零开始）

```bash
docker compose down -v        # 销毁 volume（数据全部删除）
docker compose up -d
pnpm db:push
pnpm db:seed
```

#### 命令速查

| 命令 | 作用 | 数据 |
| --- | --- | --- |
| `docker compose up -d` | 启动 PG + Redis 容器 | 保留 |
| `docker compose down` | 停止容器 | 保留（volume 还在）|
| `docker compose down -v` | 停止并销毁 volume | **全部清空** |
| `pnpm db:push` | 同步 schema 到 DB（增量） | 保留 |
| `pnpm db:seed` | 写入种子数据 | 追加/幂等 |
| `pnpm db:generate` | 生成 Prisma Client | — |
| `pnpm db:migrate` | 执行迁移文件（生产用） | — |

---

### Seed 数据说明

`pnpm db:seed`（对应 `prisma/seed.ts`）按顺序写入以下内容：

| 步骤 | 内容 | 文件 |
| --- | --- | --- |
| 1 | 默认 AI Assistant Agent | `seed-vibe-creator-agent.ts` |
| 2 | 其他系统 Agent（写作、搜索等） | `seed-agent-apps.ts` |
| 3 | 产品 SKU（订阅档位 + 积分包） | `seed-products.ts` |
| 4 | 设置管理员账号 | `seed.ts`（读取 `ADMIN_EMAIL`） |
| 5 | 密码登录测试账号 | `seed-password-login-users.ts` |
| 6 | 触达场景模板（通知邮件） | `seed-touch-scenes.ts` |

Seed 设计为**幂等**，重复运行不会创建重复数据（使用 `upsert`）。

#### 配置管理员账号

Seed 会将 `ADMIN_EMAIL` 指定的用户设为管理员（`isAdmin: true`）。

```env
# .env
ADMIN_EMAIL=your@email.com
```

> 如果该邮箱对应的用户尚未注册，seed 会跳过（不创建）。需先登录一次，再重跑 `pnpm db:seed`。

#### 密码登录测试账号

框架内置密码登录白名单机制，供本地开发和测试使用（避免每次都走 Magic Link）。

**白名单文件**：`src/server/auth/password-login-allowlist.ts`

```typescript
export const PASSWORD_LOGIN_ALLOWLIST: string[] = [
  "testadmin@example.com",
  // 可以加更多测试邮箱
];
```

**默认密码规则**：`邮箱本地部分首字母大写 + 2024!`

| 邮箱 | 默认密码 |
| --- | --- |
| `testadmin@example.com` | `Testadmin2024!` |
| `alice@example.com` | `Alice2024!` |

> 生产环境请清空 `PASSWORD_LOGIN_ALLOWLIST`，完全关闭密码登录。


### 模式 B：云服务商

> 远端数据库使用 `prisma migrate deploy`（基于迁移文件），而非 `db:push`，确保变更可追溯。

**首次部署：**

```bash
pnpm db:migrate            # 按顺序执行 prisma/migrations/ 下所有迁移文件
pnpm db:seed               # 写入种子数据
```

**后续更新（schema 变动后）：**

```bash
pnpm db:generate           # prisma migrate dev — 本地生成新迁移文件
# 将新迁移文件提交到 Git
pnpm db:migrate            # 在远端执行新增的迁移
```

#### PostgreSQL 云服务

##### Neon（推荐，Serverless）

1. 注册 [Neon](https://neon.tech/)（免费层：0.5 GB 存储，190 小时计算/月）
2. Create Project → 复制 Connection String
3. 设置 `.env`：
  ```env
   DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
  ```
4. 注意：Neon 使用连接池，建议在 URL 末尾加 `?sslmode=require&pgbouncer=true`

##### Supabase

1. 注册 [Supabase](https://supabase.com/)（免费层：500 MB 存储，无暂停限制已取消）
2. Project Settings → Database → Connection String (URI)
3. 设置 `.env`：
  ```env
   DATABASE_URL="postgresql://postgres.xxx:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
  ```

##### AWS RDS / 阿里云 RDS

1. 创建 PostgreSQL 实例
2. 配置安全组允许入站连接
3. 设置 `.env`：
  ```env
   DATABASE_URL="postgresql://user:pass@your-instance.xxx.rds.amazonaws.com:5432/dbname"
  ```

#### Redis 云服务

##### Upstash（推荐，Serverless）

1. 注册 [Upstash](https://upstash.com/)（免费层：10K 命令/天）
2. Create Database → 选择区域
3. 设置 `.env`：
  ```env
   REDIS_HOST=xxx.upstash.io
   REDIS_PORT=6379
   REDIS_PASSWORD=your-upstash-password
  ```
4. 注意：Upstash 免费层对 BullMQ 高频场景可能不够，按需升级

##### 自建 Redis（VPS）

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

## 5. 异常处理


| 场景             | 处理方式                                              |
| -------------- | ------------------------------------------------- |
| 数据库连接失败        | Prisma 自动报错，错误信息包含连接字符串（已脱敏）                      |
| Redis 连接失败     | `lazyConnect` + `retryStrategy` 自动重连（指数退避，最大 2 秒） |
| 构建期无 Redis     | 自动使用 stub，所有操作返回安全默认值                             |
| 数据库 schema 不一致 | `prisma db push` 同步，或 `prisma migrate dev` 生成迁移   |


## 6. AI 引导

### AGENTS.md 规则

- 数据库操作统一使用 `db` from `@/server/db`，不要自己创建 PrismaClient
- Redis 操作统一使用 `redis` from `@/server/redis`，不要自己创建连接
- 所有数据模型在 `prisma/schema.prisma` 中定义，修改后运行 `npx prisma db push`
- 数据库查询必须分页（cursor-based pagination，默认 limit=20）
- 不要在客户端代码中直接操作数据库

