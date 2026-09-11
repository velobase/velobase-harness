# ModelRunner image connection

Optional technical adapter for `@velobase/image-generation`. Import `ModelrunnerProvider` and construct it with explicit `{ apiKey, queueUrl, baseUrl, timeoutMs, logger? }`; no host env is read and no request is sent during construction. The complete example supplies its existing environment configuration through its compatibility wrapper.

Register only in a host that selects ModelRunner. The model ID is `owner/alias`; persist the submission's model-scoped `providerTaskUrl` together with its id. A bare request id is insufficient to reconstruct the queue endpoint. Poll URLs must remain on the configured HTTPS queue origin; authenticated requests reject redirects. GET requests can retry up to three times, while each POST is sent once. Uncertain submission outcomes belong to business reconciliation, not automatic resubmission.

Catalog pagination is bounded. Only flat per-output catalog prices produce an estimate; usage-based pricing stays unknown until provider evidence exists. These are estimates, not a user billing policy. Keep the same configured account available while its accepted tasks are outstanding.

No provider calls or tests were run.
