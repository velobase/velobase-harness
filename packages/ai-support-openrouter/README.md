# OpenRouter support adapter

This explicitly selected technical adapter implements `SupportModel` from `@velobase/ai-support`, using the repository's AI SDK 5 / OpenRouter provider integration.

`createOpenRouterSupport({ apiKey, model })` requires a host-selected model ID and credential; there is no implicit model or global environment client.

Generation requests structured output, validates the suggestion schema, limits output to 4,096 tokens and uses a 90-second abort signal with SDK retries disabled.

Email content is supplied as untrusted data.

The adapter has no tools and cannot send mail or modify an account.

The host owns authentication, activation, durable request records, review and any future retry decision.

The provider may charge for a request whose response was not received.

Do not add this dependency to the ordinary email package.

No model requests were made while preparing this adapter.
