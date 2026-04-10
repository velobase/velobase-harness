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

1. 配置 `.env`：
  ```env
   DATABASE_URL="postgresql://velobase:velobase@localhost:5432/velobase"
   REDIS_HOST=127.0.0.1
   REDIS_PORT=6379
  ```
2. **首次启动**（一条命令完成：启动容器 → 建表 → 种子数据）：
  ```bash
   make db-init
  ```
3. **日常启动**（已有数据，增量同步 schema 变更）：
  ```bash
   make db-init           # 安全地重复运行，db:push 只增量同步差异，seed 需幂等
  ```
4. **完全重置**（清空所有数据，从零开始）：
  ```bash
   make db-reset          # docker compose down -v 删除 volume → 重建 → 建表 → seed
  ```

#### 命令对照


| 命令              | 作用                      | 数据            |
| --------------- | ----------------------- | ------------- |
| `make db`       | 仅启动容器                   | 保留            |
| `make db-init`  | 启动 + 增量同步 schema + seed | 保留            |
| `make db-reset` | 销毁 volume + 重建一切        | **清空**        |
| `make db-stop`  | 停止容器                    | 保留（volume 还在） |


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

