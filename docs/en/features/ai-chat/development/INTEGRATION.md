# Integrate AI Chat

1. Use the existing UI, service and Worker owners described in the [capability guide](../README.md); do not copy a parallel module tree.
2. Configure the installed chat provider and apply Prisma migrations.
3. Start Web and Worker against the same PostgreSQL and Redis services.
4. Register the host executor and tools. Tool implementations enforce ownership independently of prompts.
5. Submit to `POST /api/chat` with a stable request ID. Observe `/api/chat/:id/run`; use its `DELETE` operation for cancellation.

This endpoint returns JSON acceptance, not an SDK streaming HTTP response. The supplied `useDurableChat` hook handles observation and repeats uncertain acceptance with the same request identity. Other clients must follow the same rule.

See [tool development](./PLUGIN_DEV.md) and [examples](./EXAMPLES.md).
