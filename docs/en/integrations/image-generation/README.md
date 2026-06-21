# Image Generation Integration

Image generation is a framework feature that exposes a provider-neutral `imageGeneration` service to business modules and AI Chat tools.

Supported providers:

- WaveSpeedAI through `WavespeedProvider`.

WaveSpeedAI API references:

- [API Integration](https://wavespeed.ai/docs/docs-api): submit tasks with `POST /api/v3/{model}`.
- [Get Result](https://wavespeed.ai/docs/get-result): poll task status with `GET /api/v3/predictions/{task-id}`.
- [List Models API](https://wavespeed.ai/docs/docs-common-api/models): verify credentials and inspect available model ids with `GET /api/v3/models`.

## Architecture

Layers:

- Provider adapter: `src/server/ai/image-generation/providers/wavespeed.ts`
- Framework service: `src/server/ai/image-generation/service.ts`
- Worker: `src/workers/processors/image-generation/processor.ts`
- Queue: `src/workers/queues/image-generation.queue.ts`
- AI Chat tools: `src/server/api/tools/image-generation-tools.ts`

Business modules should call `imageGeneration` from `@/server/ai/image-generation` and should not import WaveSpeed provider code directly.

## Configuration

WaveSpeed connection testing requires:

- `WAVESPEED_API_KEY`
- `WAVESPEED_BASE_URL`, usually `https://api.wavespeed.ai`

`IMAGE_GENERATION_MODE=auto|off|on` controls full module enablement.

`auto` enables the module when required configuration is present:

- `WAVESPEED_API_KEY`
- `WAVESPEED_BASE_URL`
- Redis connection through `REDIS_URL` or `REDIS_HOST`

Optional settings:

- `WAVESPEED_REQUEST_TIMEOUT_MS`, default `30000`
- R2 storage env vars: `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`
- Filesystem fallback env vars: `STORAGE_FILESYSTEM_ROOT`, `STORAGE_FILESYSTEM_PUBLIC_BASE_URL`

The dashboard connection check only needs the WaveSpeed key and base URL. Test generation and AI Chat tools require the worker path. If Redis is missing, tasks cannot be enqueued. Generated image bytes are never stored in Postgres: the worker uploads them through `@/server/storage`, which uses R2 by default and falls back to the filesystem when R2 is not configured or the upload fails.

## Public Service

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

Long-running execution goes through BullMQ. `generateImage()` creates and enqueues a task, then waits for the worker to finish.

## Data

Core tables:

- `ImageGenerationTask`
- `ImageGenerationAsset`

Successful worker output is uploaded through `@/server/storage`, recorded in `ImageGenerationAsset`, and mirrored to `ImageAsset` for project galleries. Postgres stores keys, URLs, metadata, and task state only.

## Dashboard Smoke Test

Admins can validate the WaveSpeedAI integration from `/dashboard`: open **Module Status**, then click the green **WaveSpeedAI** module to open its test dialog.

The panel performs three checks:

- Local configuration: verifies WaveSpeed connection settings, Redis, and storage fallback status without exposing secret values.
- Provider connection: calls the WaveSpeed provider adapter to list models and confirm the API key/base URL work.
- Test generation: creates an `ImageGenerationTask` through `imageGeneration.createTask()`. The worker processes the queue, polls WaveSpeed, uploads the output through R2 or filesystem fallback, and the dashboard polls the task until an asset is available.

Run the app with Web + Worker enabled when testing generation:

```bash
pnpm dev:all
```

Or start the processes separately:

```bash
pnpm dev
pnpm worker:dev
```

If the task stays `QUEUED`, confirm Redis and the worker process are running. If R2 is not configured or upload fails, generated files are written under `public/storage` by default.

## Testing

Use the dashboard smoke test for quick manual verification after configuring WaveSpeedAI. For code changes, run the normal quality checks from `docs/en/ai/completion-checklist.md`.

Recommended manual path:

1. Set `IMAGE_GENERATION_MODE=auto`, `WAVESPEED_API_KEY`, `WAVESPEED_BASE_URL`, and Redis env vars.
2. Start Web + Worker.
3. Sign in as an admin and open `/dashboard`.
4. In **Module Status**, click the green **WaveSpeedAI** module.
5. Click **Check connection**.
6. Run a small 1:1 test generation with a low-cost image model.

For a credentials-only smoke test, set `WAVESPEED_API_KEY` and `WAVESPEED_BASE_URL`, start Web, then use **Check connection** from the **WaveSpeedAI** module status dialog on `/dashboard`.

## AI Rules

- Validate all service and tool input with Zod.
- Keep provider-specific fields in `providerOptions`.
- Store provider responses in `providerRaw` for debugging, but never log API keys.
- Keep provider adapters stateless; orchestration belongs in service and worker code.
- Emit domain events with `appEvents.emit()` instead of calling notification or analytics integrations directly.
