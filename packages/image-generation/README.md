# Image generation business module

`@velobase/image-generation` owns task admission, immutable request replay, result waiting and accepted-job processing.

Its only dependency is Zod.

It imports no Prisma, Redis, storage implementation, host environment, chat or model provider.

Provider identifiers are host-selected strings.

## Select the capability

Add this package to the host and select `@velobase/image-generation-wavespeed`, `@velobase/image-generation-modelrunner`, or a host adapter implementing `ImageGenerationProviderAdapter`.

Register only those instances in `ImageGenerationProviderRegistry`.

The neutral registry is not a global singleton and does not discover or import providers.

A model and provider are explicit request fields; WaveSpeed tool defaults belong to the complete example.

Bind `ImageGenerationService` to `ImageGenerationOptions`: input parsers, repository, enabled-state check, project ownership check, provider lookup and enqueue callback.

The supplied Zod schemas work for an open provider registry; a host can narrow `provider` to its deployed selection.

Derive `userId` from server authentication, never a browser-submitted identity.

`getTask` without `userId` is a trusted internal operation, not a public endpoint.

The complete example's real binding is [service.ts](../../src/server/ai/image-generation/service.ts).

Its Prisma mappings remain in the host, and request replay checks owner, project, model, prompt, options and metadata.

Repository `admit` must serialize a request key and compare the saved snapshot within the same transaction.

Reusing a key for different input is an error; it never returns another user's task or silently changes the request.

Include `imageGenerationFeature.id` in the host's deployment membership, provide configuration readiness for the `images` connection and bind Admin's switch to `assertEnabled`.

The package does not install a provider or expose credentials through feature metadata.

The complete example's actual implementation is [processor.ts](../../src/workers/processors/image-generation/processor.ts), using existing Prisma rows, object storage and BullMQ.

Another host chooses its own persistence, scheduler and owned asset storage.

Persist provider connection identity with tasks, or retain the same provider account/configuration until its tasks settle.

The processing contract is:

1.

Atomically claim an unsubmitted task before calling the provider.

Never clear the submission marker automatically.
2.

Save the returned provider id and polling URL.

A missing response, interrupted process or failed evidence write leaves an uncertain submission.

Retrying that local task must not submit another generation.
3.

Poll only the recorded provider id; reject mismatched provider/id evidence.

A polling timeout leaves the remote task pending.
4.

Save outputs idempotently by task and output index.

Mark local success only after every output is stored.

Storage failure resumes collection rather than generating new images.
5.

A provider-confirmed failure can close the task.

A UI wait timeout throws `ImageGenerationWaitTimeoutError` with the existing task id and never changes its database state.

In the complete example, Admin disabling images pauses unsubmitted queue jobs.

Already-submitted jobs can continue collecting results.

Task replay and the `get_image_task` chat tool resume the same queue job, including a previously exhausted job.

Image tool calls use a stable request identity derived from their tool-call id.

Unknown submissions require operator reconciliation against the original provider account; this package does not infer non-delivery or invent a remote id.

A dedicated reconciliation UI is not delivered here.

## Storage and product UI remain host choices

`storeOutputs` is a trusted storage port: validate media type/size, retain owner identity and enforce public/private access policy.

The neutral package never downloads a provider URL or makes generated content public.

The complete example retains its existing gallery/storage adapter.

No tests, builds, application runs, migrations or model requests were executed during this change, per the user's instruction.

These are workspace source packages, not published npm releases.
