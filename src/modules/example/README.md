# Example Business Module

This is a reference template showing how to add a new business feature to the framework.

> API 编码约定（Procedure 选择、瘦 Router 原则、错误码、分页）→ [`docs/conventions/api.md`](../../../docs/conventions/api.md)  
> 后台任务添加步骤 → [`docs/integrations/queue/`](../../../docs/integrations/queue/)

## Structure

```
src/modules/example/
├── README.md                  # This file
├── server/
│   ├── router.ts              # tRPC router (API endpoints)
│   └── service.ts             # Business logic layer
├── worker/
│   ├── queue.ts               # BullMQ queue definition
│   ├── processor.ts           # Job processor
│   └── index.ts               # Export barrel
└── components/
    └── example-page.tsx       # React page component
```

## How to integrate

### 1. Register the tRPC router

In `src/server/api/root.ts`:

```ts
import { exampleRouter } from "@/modules/example/server/router";

export const appRouter = createTRPCRouter({
  // ... existing routers
  example: exampleRouter,
});
```

### 2. Register the worker (if using background jobs)

In `src/workers/queues/index.ts`:

```ts
export {
  exampleQueue,
  EXAMPLE_QUEUE_NAME,
  type ExampleJobData,
} from "@/modules/example/worker/queue";
```

In `src/workers/processors/index.ts`:

```ts
export {
  processExampleJob,
  registerExampleScheduler,
} from "@/modules/example/worker";
```

Then wire them up in `src/workers/index.ts` following the existing pattern.

### 3. Add a page route

Create `src/app/example/page.tsx`:

```tsx
import { ExamplePage } from "@/modules/example/components/example-page";
export default function Page() {
  return <ExamplePage />;
}
```
