# Storage Integration

Storage provides a framework abstraction over S3-compatible object storage providers and local filesystem fallback.

Supported providers include Cloudflare R2, filesystem, AWS S3, Alibaba OSS, Google Cloud Storage, and MinIO.

Default behavior:

- `STORAGE_PROVIDER` defaults to `r2`.
- Server-side writes use R2 when `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, and `STORAGE_SECRET_ACCESS_KEY` are configured.
- If object storage is missing or a server-side upload fails, `putObject()` falls back to filesystem storage.
- Filesystem fallback writes to `STORAGE_FILESYSTEM_ROOT`, defaulting to `public/storage`, and returns same-origin URLs under `/storage/...`.
- Set `STORAGE_FILESYSTEM_PUBLIC_BASE_URL` only when filesystem files must be exposed through an absolute external base URL.
- Database tables store object keys, URLs, and metadata only; file bytes belong in object storage or the filesystem.

## Use

- Use exports from `@/server/storage`.
- Do not call S3-compatible SDKs directly from product code.
- Validate file type, size, ownership, and access policy before upload or exposure.
- Generate URLs through the storage abstraction so CDN behavior stays consistent.

## Configuration

Common settings:

- Provider endpoint and region.
- Access key and secret.
- Bucket name.
- Optional `CDN_BASE_URL`.
- Optional `STORAGE_FILESYSTEM_ROOT` and `STORAGE_FILESYSTEM_PUBLIC_BASE_URL` for fallback files.

Update `.env.example` and `src/env.js` when adding configuration.

Cloudflare R2 example:

```env
STORAGE_PROVIDER=r2
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_BUCKET=<bucket-name>
STORAGE_ACCESS_KEY_ID=<access-key-id>
STORAGE_SECRET_ACCESS_KEY=<secret-access-key>
CDN_BASE_URL=https://cdn.example.com
```

Filesystem-only example:

```env
STORAGE_PROVIDER=filesystem
STORAGE_FILESYSTEM_ROOT=public/storage
STORAGE_FILESYSTEM_PUBLIC_BASE_URL=http://localhost:3000
```

## AI Rules

- Keep uploaded files owned by a user, organization, or product entity.
- Never trust client-provided storage keys for authorization.
- Public assets and private assets must have different access rules.
- If upload work is long-running or retryable, use queues.
