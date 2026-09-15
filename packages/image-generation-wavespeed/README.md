# WaveSpeed image connection

Optional technical adapter for `@velobase/image-generation`. Import `WavespeedProvider` and construct it with explicit `{ apiKey, baseUrl, timeoutMs, logger? }`; no host env is read and no request is sent during construction. The complete example selects its existing env configuration in `src/server/ai/image-generation/providers/wavespeed.ts`.

Register this instance only in a host that includes WaveSpeed. Model IDs remain selected request data, not global defaults. The adapter supports prediction submission/query, model listing, capabilities and price estimates.

API URLs must use HTTPS without credentials/query/fragment. Authenticated polling stays on the configured API origin and redirects are rejected. GET requests can retry up to three times; POST requests are sent once. An uncertain POST response must be reconciled by the business task processor, never retried as a new generation because `retryable` describes a transport condition. Keys stay server-side. Provider raw responses are diagnostic data and must not be returned to public clients.

No provider calls or tests were run.
