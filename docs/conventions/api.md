# API 约定

本文档定义框架中 API 层的分区规则、编码约定和创建模式。

> **定位**：本文件指导 AI 和开发者正确使用和创建 API。  
> 不同于 `docs/integrations/` 中对第三方服务的详细梳理，本文件关注的是 **tRPC 路由层和 HTTP 路由层的统一规范**。

---

## API 三区制

所有 API 按职责分为三个区域，每个区域有不同的操作规则：

```
┌──────────────────────────────────────────────────────┐
│  🔒 锁定区 — 框架平台 API                             │
│  任何 SaaS 都需要的通用能力，换产品不用动               │
├──────────────────────────────────────────────────────┤
│  🔧 扩展区 — 第三方集成 API                            │
│  封装外部服务，按 Provider 模式扩展                     │
├──────────────────────────────────────────────────────┤
│  🆕 自由区 — 业务 API                                  │
│  当前产品特有，换产品全部替换                            │
└──────────────────────────────────────────────────────┘
```

### 🔒 锁定区 — 框架平台 API

这些 API 是框架提供的 SaaS 通用能力。**只调用，不修改。**

| Router | 说明 | 代码位置 | 归属文档 | 状态 |
| --- | --- | --- | --- | --- |
| `product.*` | 产品 SKU 查询 | `src/server/product/routers/` | [payment](../integrations/payment/) | ✅ 已整理 |
| `billing.*` | 积分操作（授予/冻结/消费/查余额） | `src/server/billing/routers/` | [payment](../integrations/payment/) | ✅ 已整理 |
| `order.*` | 订单全流程（创建/支付/退款） | `src/server/order/routers/` | [payment](../integrations/payment/) | ✅ 已整理 |
| `membership.*` | 订阅管理 | `src/server/membership/routers/` | [payment](../integrations/payment/) | ✅ 已整理 |
| `promo.*` | 优惠码（验证/兑换） | `src/server/promo/routers/` | 框架功能，待整理 | ⏳ 待整理 |
| `affiliate.*` | 联盟推广（激活/佣金/提现） | `src/server/api/routers/affiliate.ts` | 框架功能，待整理 | ⏳ 待整理 |
| `account.*` | 用户账户管理 | `src/server/api/routers/account/` | 随 auth 集成 | ✅ 已整理 |
| `notification.*` | 通知偏好管理 | `src/server/api/routers/notification.ts` | 第三方集成，待整理 | ⏳ 待整理 |
| `admin.*` | 后台管理（39 个 procedure） | `src/server/admin/routers/` | 框架基础设施 | ✅ 已整理 |

**AI 规则**：
- ✅ 在业务代码中通过 `api.billing.getBalance.useQuery()` 等方式调用
- ✅ 在服务端通过 `createCaller` 调用
- ❌ 禁止修改这些 Router 的 procedure 签名
- ❌ 禁止在这些 Router 中添加业务特定逻辑

### 🔧 扩展区 — 第三方集成 API

这些 API 封装外部服务。**可按 Provider 模式扩展，但不改变接口签名。**

| Router / Route | 说明 | 详细文档 | 状态 |
| --- | --- | --- | --- |
| `storage.*` | 对象存储 | [storage](../integrations/storage/) | ✅ 已整理 |
| `auth/[...nextauth]` | 认证端点 | [auth](../integrations/auth/) | ✅ 已整理 |
| `auth/github/callback` | GitHub OAuth 回调 | [auth](../integrations/auth/) | ✅ 已整理 |
| `webhooks/stripe` | Stripe 支付回调 | [payment](../integrations/payment/) | ✅ 已整理 |
| `webhooks/nowpayments` | NowPayments 回调 | [payment](../integrations/payment/) | ✅ 已整理 |
| `webhooks/resend` | Resend 邮件状态回调 | [email](../integrations/email/) | ✅ 已整理 |
| `telegram.*` | Telegram Bot 绑定/支付 | 第三方集成，待整理 | ⏳ 待整理 |
| `webhooks/telegram` | Telegram Bot 回调 | 第三方集成，待整理 | ⏳ 待整理 |
| `webhooks/lark-support` | 飞书客服卡片交互 | 第三方集成，待整理 | ⏳ 待整理 |
| `lark/webhook` | 飞书事件订阅 | 第三方集成，待整理 | ⏳ 待整理 |

> **待整理项说明**：  
> `telegram.*` + `webhooks/telegram` 属于 Telegram 第三方集成，归入 `docs/integration-guide.md` 第 10 项（通知）。  
> `webhooks/lark-support` + `lark/webhook` 属于飞书/Lark 第三方集成，同样归入第 10 项（通知）。

**AI 规则**：
- ✅ 添加新的 Provider（如新增支付网关），遵循已有 Provider 的目录结构
- ✅ 添加新的 Webhook 路由，遵循下方 Webhook 约定
- ❌ 禁止修改已有集成 API 的接口签名
- 📖 修改前先阅读对应的 `docs/integrations/` 文档（⏳ 标记的模块尚无详细文档）

### 🆕 自由区 — 业务 API

当前产品（AI Chat）的功能 API。**换产品时全部替换。**

| Router | 说明 | 代码位置 |
| --- | --- | --- |
| `conversation.*` | 对话 CRUD / 分享 | `src/server/api/routers/conversation.ts` |
| `agent.*` | 系统 Agent 查询 | `src/server/api/routers/agent.ts` |
| `userAgent.*` | 用户 Agent 管理 | `src/server/api/routers/user-agent.ts` |
| `project.*` | 项目管理 | `src/server/api/routers/project.ts` |
| `repository.*` | 仓库绑定 | `src/server/api/routers/repository.ts` |
| `github.*` | GitHub 集成 | `src/server/api/routers/github.ts` |
| `api/chat` | AI 对话流式接口 | `src/app/api/chat/route.ts` |

**AI 规则**：
- ✅ 新功能按 `src/modules/<name>/` 模式创建（参考 `modules/example/`）
- ✅ 自由创建新 Router，挂载到 `src/server/api/root.ts`
- ✅ 遵循下方编码约定

---

## tRPC 编码约定

### 规则 1：Procedure 选择

```
读数据，不需要登录？         → publicProcedure
读/写数据，需要登录？        → protectedProcedure
后台管理操作？              → adminProcedure
高频调用需要限流？           → rateLimitedProcedure
```

可用的 Procedure 定义在 `src/server/api/trpc.ts`，导入路径：

```typescript
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
  rateLimitedProcedure,
} from "@/server/api/trpc";
```

### 规则 2：瘦 Router 原则

Router 只做三件事：**选 procedure + 校验输入 + 调用 service**。业务逻辑全部在 service 层。

```typescript
// ✅ 正确
export const featureRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return featureService.create(ctx.session.user.id, input);
    }),
});

// ❌ 错误：在 Router 里写业务逻辑
export const featureRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.feature.findFirst({ ... });
      if (existing) throw new TRPCError({ code: 'CONFLICT' });
      await billing.deduct(ctx.session.user.id, 10);
      const item = await db.feature.create({ ... });
      await queue.add('process', { id: item.id });
      return item;
    }),
});
```

### 规则 3：错误码使用

| 场景 | 错误码 | 谁来抛 |
| --- | --- | --- |
| 用户输入不合法 | `BAD_REQUEST` | service 层 |
| 未登录 | `UNAUTHORIZED` | protectedProcedure 自动 |
| 无权限 / 账号封禁 | `FORBIDDEN` | protectedProcedure 或 service 层 |
| 资源不存在 | `NOT_FOUND` | service 层 |
| 资源冲突 | `CONFLICT` | service 层 |
| 请求频率过高 | `TOO_MANY_REQUESTS` | rateLimitedProcedure 或 IP 限流自动 |
| 服务内部错误 | `INTERNAL_SERVER_ERROR` | 未捕获异常自动（会触发飞书告警） |

### 规则 4：分页约定

所有列表查询使用 cursor-based 分页：

```typescript
.input(z.object({
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
}))

// 返回格式
return {
  items: [...],
  nextCursor: lastItem?.id ?? null,
};
```

### 规则 5：Router 注册

新 Router 必须在 `src/server/api/root.ts` 中注册：

```typescript
import { featureRouter } from "@/modules/my-feature/server/router";

export const appRouter = createTRPCRouter({
  // ... existing routers
  myFeature: featureRouter,  // 驼峰命名
});
```

---

## Webhook 编码约定

### 创建新 Webhook

路径：`src/app/api/webhooks/<provider>/route.ts`

```typescript
export async function POST(req: Request) {
  // 1. 读取原始 body
  const rawBody = await req.clone().text();

  // 2. 验证签名（必须）
  const signature = req.headers.get("<provider>-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }
  // ... 验证签名逻辑

  // 3. 记录 Webhook 日志（幂等 upsert）
  await db.paymentWebhookLog.upsert({ ... });

  // 4. 处理业务逻辑（必须幂等）
  try {
    await handleEvent(event);
  } catch (err) {
    // 5. 业务逻辑失败也返回 200（避免第三方重试风暴）
    //    记录错误日志 + 告警
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
```

### Webhook 硬规则

- **必须验证签名** — 第一步永远是验签，拒绝无签名请求
- **必须幂等** — 同一事件重复投递不产生副作用（用 eventId upsert）
- **成功返回 200** — 即使业务处理失败也返回 200，避免第三方无限重试
- **记录 WebhookLog** — 每次收到 webhook 都写日志，方便排查
- **不做重计算** — 复杂逻辑通过队列异步处理，webhook handler 只负责接收和分发

---

## 流式 HTTP 路由

对于不适合 tRPC 的场景（如 SSE 流式响应），使用 Next.js Route Handler：

路径：`src/app/api/<name>/route.ts`

```typescript
export async function POST(req: Request) {
  // 1. 手动鉴权
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. 输入校验
  const body = await req.json();
  const input = schema.parse(body);

  // 3. 返回流
  const stream = createStream(input);
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
```

当前仅 `api/chat` 使用此模式（AI 对话流式接口）。

---

## 创建新业务 API — 完整步骤

参考模板：`src/modules/example/`

```
src/modules/<name>/
├── server/
│   ├── router.ts        # tRPC Router（瘦胶水层）
│   └── service.ts       # 业务逻辑（所有复杂逻辑在这里）
├── worker/              # 后台任务（可选，详见 docs/integrations/queue/）
│   ├── queue.ts
│   ├── processor.ts
│   └── index.ts
├── components/          # React 组件
│   └── feature-page.tsx
└── README.md            # 模块说明
```

**步骤**：

1. 创建 `src/modules/<name>/server/service.ts` — 写业务逻辑
2. 创建 `src/modules/<name>/server/router.ts` — 瘦 Router，调用 service
3. 在 `src/server/api/root.ts` 注册 Router
4. 如需异步处理，创建 `worker/` 目录（按[队列文档](../integrations/queue/)的步骤）
5. 如需数据模型，在 `prisma/schema.prisma` 添加，运行 `npx prisma db push`
6. 创建前端组件，通过 `api.<name>.<procedure>.useQuery/useMutation()` 调用

---

## 基础设施层

以下文件是 API 层的基础设施，**一般不需要修改**：

| 文件 | 职责 |
| --- | --- |
| `src/server/api/trpc.ts` | Context 创建 + Procedure 定义 + 中间件 |
| `src/app/api/trpc/[trpc]/route.ts` | tRPC HTTP 适配器 + IP 全局限流 + 错误告警 |
| `src/server/api/root.ts` | Router 注册中心（只做添加操作） |

修改场景（少见）：
- 添加新的 Procedure 类型（如需要新的权限模型）→ 修改 `trpc.ts`
- 修改全局错误处理策略 → 修改 `route.ts` 的 `onError`
