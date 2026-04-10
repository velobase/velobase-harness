# 存储（Storage）集成文档

> 第三方集成梳理 · 第 5 站

## 1. 选型

### 支持的存储服务


| 服务                   | 协议           | 适用场景              | 状态    |
| -------------------- | ------------ | ----------------- | ----- |
| Cloudflare R2        | S3 兼容        | 推荐首选，零出口费用，全球 CDN | ✅ 已接入 |
| AWS S3               | S3 原生        | 最成熟，生态最全          | ✅ 已接入 |
| 阿里云 OSS              | S3 兼容        | 中国大陆场景            | ✅ 已接入 |
| Google Cloud Storage | S3 兼容 (HMAC) | GCP 生态用户          | ✅ 已接入 |
| MinIO                | S3 兼容        | 本地开发/自托管          | ✅ 已接入 |


### 选型理由

所有支持的存储服务都兼容 S3 协议，因此框架只需一个 `@aws-sdk/client-s3` 即可适配全部 5 种后端，通过 `STORAGE_PROVIDER` 环境变量切换。

- **R2 推荐为默认**：零出口流量费，适合图片/视频等高带宽场景
- **S3 作为通用后备**：最成熟的对象存储方案
- **MinIO 用于本地开发**：免去云服务依赖

### 共存关系

互斥（同一时间只用一个 provider），通过 `STORAGE_PROVIDER` 环境变量选择。

## 2. 架构设计

### 当前状态

当前存储能力**已有良好封装**，集中在两个文件中：

```
src/server/storage.ts              ← 核心：S3 客户端 + 所有存储操作
src/server/api/routers/storage.ts  ← tRPC 路由：前端上传/下载/删除
src/components/upload/file-upload.tsx ← 前端上传组件
```

**优点：**

- 多 provider 通过环境变量一键切换
- 统一使用 `@aws-sdk/client-s3` + S3 兼容协议
- 前端通过 presigned URL 直传，不经过服务器
- 支持 CDN URL 优先

**需要清理的问题：**

1. `generateVideoKey()` / `generateThumbnailKey()` — 业务特定的路径生成函数，不属于框架
2. 所有逻辑集中在一个 323 行的大文件中，可拆分提高可维护性

### 目标架构

```
src/server/storage/
├── index.ts              # 统一导出
├── client.ts             # S3Client 创建（多 provider 配置）
├── operations.ts         # 通用操作：putObject, getObject, signedUrl 等
└── url.ts                # URL 生成：getPublicUrl, CDN 逻辑

src/server/api/routers/storage.ts  ← 保持不变
src/components/upload/file-upload.tsx ← 保持不变
```

### 数据流

```
前端组件
    │
    ├── FileUpload ──→ tRPC storage.getPresignedUploadUrl
    │                         │
    │                         ▼
    │                  storage.client → S3Client
    │                         │
    │                  返回 presigned URL
    │                         │
    ├── XHR PUT ──────────→ R2/S3/OSS（前端直传）
    │
    └── 使用 publicUrl 展示

服务端
    │
    ├── putObject(buffer, key, contentType)  → 服务端上传
    ├── getObject(key)                       → 服务端下载
    ├── getPublicUrl(key)                    → 获取公开 URL
    └── getStorageSignedUrl(key)             → 获取临时 URL
```

## 3. 接口定义

### 服务端 API（from `@/server/storage`）

```typescript
// S3 客户端
function getStorageClient(): S3Client;
function getStorageBucket(): string;

// 文件操作
function putObject(buffer: Buffer, key: string, contentType: string): Promise<void>;
function getObject(key: string): Promise<Buffer>;

// URL 生成
function getPublicUrl(key: string): string;
function getStorageSignedUrl(key: string, expiresIn?: number): Promise<string>;
function getUploadPresignedUrl(key: string, contentType: string, expiresIn?: number): Promise<string>;

// 工具函数
function generateFileKey(filename: string, userId: string): string;
function downloadAndUploadImage(imageUrl: string, userId: string, imageId: string): Promise<{ storageKey: string; publicUrl: string }>;
```

### 客户端 tRPC API（`api.storage.*`）

```typescript
// 获取上传 presigned URL（mutation）
storage.getPresignedUploadUrl({ filename, contentType, maxSizeBytes? })
  → { uploadUrl, fileKey, publicUrl }

// 删除文件（mutation）
storage.deleteFile({ fileKey })
  → { success: boolean }

// 获取下载 presigned URL（query）
storage.getPresignedDownloadUrl({ fileKey })
  → { downloadUrl }
```

### 功能边界

**存储模块做的事：**

- 文件上传/下载/删除
- Presigned URL 生成（前端直传）
- 多 provider 自动适配
- Public URL / CDN URL 生成

**存储模块不做的事：**

- 文件路径规则（由业务模块定义 key 格式）
- 文件类型校验（由调用方或前端负责）
- 图片/视频处理（裁剪、转码等，属于业务逻辑）
- 访问权限控制（公开 vs 私有，由 bucket 配置决定）

## 4. 配置

### 环境变量


| 变量                          | 必填         | 说明                                        | 默认值         |
| --------------------------- | ---------- | ----------------------------------------- | ----------- |
| `STORAGE_PROVIDER`          | 否          | `aws` / `aliyun` / `gcs` / `minio` / `r2` | `aws`       |
| `STORAGE_REGION`            | 视 provider | 区域（R2 自动为 `auto`）                         | `us-east-1` |
| `STORAGE_BUCKET`            | 是          | 存储桶名称                                     | —           |
| `STORAGE_ACCESS_KEY_ID`     | 是          | 访问密钥 ID                                   | —           |
| `STORAGE_SECRET_ACCESS_KEY` | 是          | 访问密钥 Secret                               | —           |
| `STORAGE_ENDPOINT`          | 视 provider | 自定义端点（R2/OSS/MinIO 必填）                    | —           |
| `CDN_BASE_URL`              | 否          | CDN 域名，优先用于生成公开 URL                       | —           |


### 各 Provider 配置要点

#### Cloudflare R2（推荐）

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → R2 → Create Bucket
2. R2 → Manage R2 API Tokens → Create API Token（权限选 Object Read & Write）
3. 记录 Token 页面的 Access Key ID 和 Secret Access Key
4. 环境变量：
  ```env
   STORAGE_PROVIDER=r2
   STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   STORAGE_BUCKET=your-bucket-name
   STORAGE_ACCESS_KEY_ID=your-r2-access-key-id
   STORAGE_SECRET_ACCESS_KEY=your-r2-secret-access-key
  ```
5. 可选：R2 → Settings → Custom Domains 绑定自定义域名，设为 `CDN_BASE_URL`
6. 注意：R2 的 region 固定为 `auto`，代码中已自动处理，无需设置 `STORAGE_REGION`

#### AWS S3

1. [AWS Console](https://console.aws.amazon.com/s3/) → Create Bucket
2. 设置 Bucket 的 Block Public Access（根据需要开启/关闭公开访问）
3. IAM → Create User → Attach Policy `AmazonS3FullAccess`（或自定义最小权限）→ Create Access Key
4. 环境变量：
  ```env
   STORAGE_PROVIDER=aws
   STORAGE_REGION=us-east-1
   STORAGE_BUCKET=your-bucket-name
   STORAGE_ACCESS_KEY_ID=your-aws-access-key-id
   STORAGE_SECRET_ACCESS_KEY=your-aws-secret-access-key
  ```
5. 可选：配合 CloudFront 分发，将 Distribution 域名设为 `CDN_BASE_URL`
6. 注意：Bucket 名称全球唯一，region 决定存储位置和延迟

#### 阿里云 OSS

1. [阿里云控制台](https://oss.console.aliyun.com/) → 创建 Bucket（选择区域和存储类型）
2. RAM 访问控制 → 创建用户 → 授权 `AliyunOSSFullAccess` → 创建 AccessKey
3. 环境变量：
  ```env
   STORAGE_PROVIDER=aliyun
   STORAGE_REGION=oss-cn-hangzhou
   STORAGE_BUCKET=your-bucket-name
   STORAGE_ACCESS_KEY_ID=your-aliyun-access-key-id
   STORAGE_SECRET_ACCESS_KEY=your-aliyun-access-key-secret
   STORAGE_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
  ```
4. 可选：绑定自定义域名（Bucket → 传输管理 → 域名管理），设为 `CDN_BASE_URL`
5. 注意：`STORAGE_REGION` 和 `STORAGE_ENDPOINT` 中的区域必须一致；跨区域访问需额外配置

#### Google Cloud Storage

1. [GCP Console](https://console.cloud.google.com/storage/) → Create Bucket
2. Settings → Interoperability → Create a key for a Service Account（生成 HMAC 密钥）
3. 环境变量：
  ```env
   STORAGE_PROVIDER=gcs
   STORAGE_BUCKET=your-bucket-name
   STORAGE_ACCESS_KEY_ID=your-gcs-hmac-access-key
   STORAGE_SECRET_ACCESS_KEY=your-gcs-hmac-secret
   STORAGE_ENDPOINT=https://storage.googleapis.com
  ```
4. 可选：通过 Cloud CDN 或 Firebase Hosting 代理，设为 `CDN_BASE_URL`
5. 注意：GCS 使用 HMAC 密钥实现 S3 兼容，region 代码中自动设为 `auto`；需在 Interoperability 页面启用

#### MinIO（本地开发）

1. 启动 MinIO 容器：
  ```bash
   docker run -d --name minio \
     -p 9000:9000 -p 9001:9001 \
     -e MINIO_ROOT_USER=minioadmin \
     -e MINIO_ROOT_PASSWORD=minioadmin \
     minio/minio server /data --console-address ":9001"
  ```
2. 访问 `http://localhost:9001` 管理控制台，创建 Bucket
3. 环境变量：
  ```env
   STORAGE_PROVIDER=minio
   STORAGE_REGION=us-east-1
   STORAGE_BUCKET=your-bucket-name
   STORAGE_ACCESS_KEY_ID=minioadmin
   STORAGE_SECRET_ACCESS_KEY=minioadmin
   STORAGE_ENDPOINT=http://localhost:9000
  ```
4. 注意：MinIO 使用 `forcePathStyle=true`（代码已自动处理），适合本地开发和自托管场景

## 5. 异常处理


| 场景               | 处理方式                                                |
| ---------------- | --------------------------------------------------- |
| 凭证未配置            | `getStorageClient()` 抛出明确错误                         |
| Bucket 未设置       | `getStorageBucket()` 抛出 `STORAGE_BUCKET not set`    |
| 上传失败             | 记录详细错误日志（httpStatusCode, requestId, attempts），抛给调用方 |
| 下载文件不存在          | S3 返回 NoSuchKey，框架透传                                |
| Presigned URL 过期 | 前端重新请求新的 URL                                        |
| 文件权限不足           | tRPC 路由中检查 fileKey 包含 userId                        |


## 6. AI 引导

### 类型约束

```typescript
// putObject 强制要求 contentType，防止上传时遗漏
putObject(buffer: Buffer, key: string, contentType: string): Promise<void>;

// generateFileKey 强制要求 userId，确保文件隔离
generateFileKey(filename: string, userId: string): string;
```

### AGENTS.md 规则

- 文件上传/下载统一使用 `@/server/storage` 导出的函数
- 不要直接创建 `S3Client`，使用 `getStorageClient()`
- 文件 key 必须包含 `userId` 用于权限隔离
- 前端上传走 presigned URL 直传（`api.storage.getPresignedUploadUrl`），不要把文件发给服务器
- 业务特定的文件路径规则（如头像、文档）在业务模块中定义，不放入 storage 模块

### 框架化清理项

- 移除 `generateVideoKey()` / `generateThumbnailKey()` — 业务特定代码
- 拆分 `storage.ts` 为 `storage/` 目录（client + operations + url）
- 更新 AGENTS.md 新增存储规则

