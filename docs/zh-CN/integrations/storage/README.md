# 存储集成

Storage 为 S3-compatible 对象存储 providers 和本地文件系统 fallback 提供框架抽象。

支持的 providers 包括 Cloudflare R2、filesystem、AWS S3、Alibaba OSS、Google Cloud Storage 和 MinIO。

默认行为：

- `STORAGE_PROVIDER` 默认为 `r2`。
- 当 `STORAGE_ENDPOINT`、`STORAGE_BUCKET`、`STORAGE_ACCESS_KEY_ID`、`STORAGE_SECRET_ACCESS_KEY` 配置齐全时，服务端写入优先使用 R2。
- 如果对象存储未配置或服务端上传失败，`putObject()` 会自动 fallback 到文件系统。
- 文件系统 fallback 写入 `STORAGE_FILESYSTEM_ROOT`，默认是 `public/storage`，并返回同源 `/storage/...` URL。
- 只有当文件系统文件需要通过外部绝对域名访问时，才设置 `STORAGE_FILESYSTEM_PUBLIC_BASE_URL`。
- 数据库只存 object key、URL 和 metadata；文件二进制应放在对象存储或文件系统，不进 PG。

## 使用

- 使用 `@/server/storage` 的 exports。
- 产品代码不要直接调用 S3-compatible SDK。
- 上传或暴露文件前校验 file type、size、ownership 和 access policy。
- 通过 storage abstraction 生成 URLs，保持 CDN 行为一致。

## 配置

常见配置：

- Provider endpoint 和 region。
- Access key 和 secret。
- Bucket name。
- 可选 `CDN_BASE_URL`。
- 可选 `STORAGE_FILESYSTEM_ROOT` 和 `STORAGE_FILESYSTEM_PUBLIC_BASE_URL`，用于 fallback 文件。

新增配置时更新 `.env.example` 和 `src/env.js`。

Cloudflare R2 示例：

```env
STORAGE_PROVIDER=r2
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_BUCKET=<bucket-name>
STORAGE_ACCESS_KEY_ID=<access-key-id>
STORAGE_SECRET_ACCESS_KEY=<secret-access-key>
CDN_BASE_URL=https://cdn.example.com
```

纯文件系统示例：

```env
STORAGE_PROVIDER=filesystem
STORAGE_FILESYSTEM_ROOT=public/storage
STORAGE_FILESYSTEM_PUBLIC_BASE_URL=http://localhost:3000
```

## AI 规则

- 上传文件必须归属于 user、organization 或 product entity。
- 不要信任客户端传入的 storage keys 做授权。
- Public assets 和 private assets 需要不同访问规则。
- 如果上传工作耗时或需要重试，使用 queues。
