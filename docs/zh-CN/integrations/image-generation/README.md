# 图片生成集成

图片生成是框架级能力，通过 provider-neutral 的 `imageGeneration` service 暴露给业务模块和 AI Chat 工具。

当前支持的 provider：

- WaveSpeedAI，通过 `WavespeedProvider` 接入。

WaveSpeedAI API 参考：

- [API Integration](https://wavespeed.ai/docs/docs-api)：用 `POST /api/v3/{model}` 提交任务。
- [Get Result](https://wavespeed.ai/docs/get-result)：用 `GET /api/v3/predictions/{task-id}` 轮询任务状态。
- [List Models API](https://wavespeed.ai/docs/docs-common-api/models)：用 `GET /api/v3/models` 验证凭证并查看可用模型 ID。

## 架构

分层：

- Provider adapter：`src/server/ai/image-generation/providers/wavespeed.ts`
- 框架 service：`src/server/ai/image-generation/service.ts`
- Worker：`src/workers/processors/image-generation/processor.ts`
- Queue：`src/workers/queues/image-generation.queue.ts`
- AI Chat 工具：`src/server/api/tools/image-generation-tools.ts`

业务模块应从 `@/server/ai/image-generation` 调用 `imageGeneration`，不要直接 import WaveSpeed provider 代码。

## 配置

WaveSpeed 连接测试需要：

- `WAVESPEED_API_KEY`
- `WAVESPEED_BASE_URL`，通常是 `https://api.wavespeed.ai`

`IMAGE_GENERATION_MODE=auto|off|on` 控制完整模块启用。

`auto` 会在以下配置齐全时启用模块：

- `WAVESPEED_API_KEY`
- `WAVESPEED_BASE_URL`
- 通过 `REDIS_URL` 或 `REDIS_HOST` 配置 Redis 连接

可选配置：

- `WAVESPEED_REQUEST_TIMEOUT_MS`，默认 `30000`
- R2 storage 环境变量：`STORAGE_ENDPOINT`、`STORAGE_BUCKET`、`STORAGE_ACCESS_KEY_ID`、`STORAGE_SECRET_ACCESS_KEY`
- 文件系统 fallback 环境变量：`STORAGE_FILESYSTEM_ROOT`、`STORAGE_FILESYSTEM_PUBLIC_BASE_URL`

Dashboard 连接检查只需要 WaveSpeed key 和 base URL。试生成和 AI Chat 工具需要完整 Worker 链路。如果 Redis 缺失，任务无法入队。生成图片二进制不会存入 Postgres：worker 会通过 `@/server/storage` 上传，默认优先使用 R2，R2 未配置或上传失败时 fallback 到文件系统。

## 公开 Service

```ts
import { imageGeneration } from "@/server/ai/image-generation";

const asset = await imageGeneration.generateImage({
  provider: "wavespeed",
  model: "openai/gpt-image-2/text-to-image",
  operation: "text-to-image",
  prompt,
  aspectRatio: "16:9",
  quality: "medium",
  resolution: "1k",
  outputFormat: "png",
  userId,
  metadata: {
    module: "ppt-generator",
    projectId,
  },
});
```

慢任务通过 BullMQ 执行。`generateImage()` 会创建任务并入队，然后等待 worker 完成。

## 数据

核心表：

- `ImageGenerationTask`
- `ImageGenerationAsset`

Worker 成功后会通过 `@/server/storage` 上传输出图片，写入 `ImageGenerationAsset`，并同步创建 `ImageAsset`，供项目图库复用。Postgres 只保存 key、URL、metadata 和任务状态。

## Dashboard 冒烟测试

管理员可以在 `/dashboard` 验证 WaveSpeedAI 接入：打开 **模块状态**，点击变绿的 **WaveSpeedAI** 模块后会出现测试弹窗。

面板包含三层检查：

- 本地配置：检查 WaveSpeed 连接配置、Redis 和 storage fallback 状态，不暴露密钥值。
- Provider 连接：通过 WaveSpeed provider adapter 拉取模型列表，确认 API key/base URL 可用。
- 试生成：通过 `imageGeneration.createTask()` 创建 `ImageGenerationTask`。Worker 处理队列、轮询 WaveSpeed、通过 R2 或文件系统 fallback 上传结果，dashboard 轮询任务直到图片可用。

测试生成时需要同时启动 Web 和 Worker：

```bash
pnpm dev:all
```

也可以分别启动：

```bash
pnpm dev
pnpm worker:dev
```

如果任务一直停在 `QUEUED`，优先检查 Redis 和 Worker 进程。如果 R2 未配置或上传失败，生成文件默认会写到 `public/storage`。

## 测试

配置 WaveSpeedAI 后，用 dashboard 冒烟测试做快速人工验证。涉及代码变更时，继续执行 `docs/zh-CN/ai/completion-checklist.md` 中的常规质量检查。

推荐人工路径：

1. 设置 `IMAGE_GENERATION_MODE=auto`、`WAVESPEED_API_KEY`、`WAVESPEED_BASE_URL` 和 Redis 环境变量。
2. 启动 Web + Worker。
3. 用管理员账号登录并打开 `/dashboard`。
4. 在 **模块状态** 中点击变绿的 **WaveSpeedAI** 模块。
5. 点击 **检查连接**。
6. 使用低成本图片模型运行一次 1:1 试生成。

如果只做凭证冒烟测试，设置 `WAVESPEED_API_KEY` 和 `WAVESPEED_BASE_URL`，启动 Web，然后在 `/dashboard` 的 **WaveSpeedAI** 模块状态弹窗中点击 **检查连接**。

## AI 规则

- service 和 tool 输入必须用 Zod 校验。
- provider 特有字段放入 `providerOptions`。
- provider 响应保留在 `providerRaw` 便于排障，但不能记录 API Key。
- Provider adapter 保持无状态；编排逻辑属于 service 和 worker。
- 用 `appEvents.emit()` 发领域事件，不要在核心流程直接调用通知或分析集成。
