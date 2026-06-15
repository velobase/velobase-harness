import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/env";
import { createLogger } from "@/lib/logger";
import type { PutObjectCommandInput } from "@aws-sdk/client-s3";

type StorageProvider = "aws" | "aliyun" | "gcs" | "minio" | "r2" | "filesystem";
type ObjectStorageProvider = Exclude<StorageProvider, "filesystem">;

interface StorageConfig {
  region: string;
  endpoint?: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  forcePathStyle?: boolean;
  requestTimeout?: number;
  connectionTimeout?: number;
}

export interface StoredObject {
  provider: StorageProvider;
  storageKey: string;
  publicUrl: string;
}

const DEFAULT_STORAGE_PROVIDER = "r2" satisfies StorageProvider;
const FILESYSTEM_PUBLIC_PATH = "/storage";
const logger = createLogger("storage");

/**
 * Get S3 client based on provider configuration
 */
export function getStorageClient(): S3Client {
  const provider = getStorageProvider();

  if (provider === "filesystem") {
    throw new Error("Filesystem storage does not use an S3 client");
  }

  const config = getObjectStorageConfig(provider);

  if (!isObjectStorageConfigured(provider, config)) {
    throw new Error(
      `Storage credentials not configured for provider: ${provider}`,
    );
  }

  return new S3Client(config);
}

function getStorageProvider(): StorageProvider {
  return (env.STORAGE_PROVIDER ?? DEFAULT_STORAGE_PROVIDER) as StorageProvider;
}

function getObjectStorageConfig(
  provider: ObjectStorageProvider,
): StorageConfig {
  const configs: Record<ObjectStorageProvider, StorageConfig> = {
    aws: {
      region: env.STORAGE_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY ?? "",
      },
      requestTimeout: 300000, // 5 minutes for large files
      connectionTimeout: 30000, // 30 seconds to establish connection
    },
    aliyun: {
      region: env.STORAGE_REGION ?? "oss-cn-hangzhou",
      endpoint:
        env.STORAGE_ENDPOINT ??
        `https://${env.STORAGE_REGION ?? "oss-cn-hangzhou"}.aliyuncs.com`,
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY ?? "",
      },
      forcePathStyle: false, // Aliyun OSS uses virtual-hosted style by default
      requestTimeout: 300000, // 5 minutes for large files
      connectionTimeout: 30000, // 30 seconds to establish connection
    },
    gcs: {
      region: "auto",
      endpoint: env.STORAGE_ENDPOINT ?? "https://storage.googleapis.com",
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY ?? "",
      },
    },
    minio: {
      region: env.STORAGE_REGION ?? "us-east-1",
      endpoint: env.STORAGE_ENDPOINT ?? "http://localhost:9000",
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY ?? "",
      },
      forcePathStyle: true,
    },
    r2: {
      region: "auto", // R2 uses 'auto' region
      endpoint: env.STORAGE_ENDPOINT, // e.g., https://<account-id>.r2.cloudflarestorage.com
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY ?? "",
      },
      forcePathStyle: false,
      requestTimeout: 300000,
      connectionTimeout: 30000,
    },
  };

  return configs[provider];
}

function isObjectStorageConfigured(
  provider: ObjectStorageProvider,
  config = getObjectStorageConfig(provider),
): boolean {
  const bucket = env.STORAGE_BUCKET;
  if (!config.credentials.accessKeyId || !config.credentials.secretAccessKey) {
    return false;
  }
  if (!bucket) return false;
  if (provider === "r2" && !config.endpoint) return false;
  return true;
}

function shouldUseObjectStorage(
  provider: StorageProvider,
): provider is ObjectStorageProvider {
  return provider !== "filesystem" && isObjectStorageConfigured(provider);
}

/**
 * Transparently prepend STORAGE_PATH_PREFIX to S3 object keys.
 * Application-level code works with unprefixed keys; the prefix is only
 * applied when interacting with the underlying S3-compatible API.
 */
export function resolveStorageKey(key: string): string {
  const prefix = env.STORAGE_PATH_PREFIX;
  if (!prefix) return key;
  return `${prefix}/${key}`;
}

/**
 * Get storage bucket name
 */
export function getStorageBucket(): string {
  const bucket = env.STORAGE_BUCKET;
  if (!bucket) {
    throw new Error("STORAGE_BUCKET environment variable is not set");
  }
  return bucket;
}

/**
 * Generate a unique file key with timestamp and random string
 */
export function generateFileKey(filename: string, userId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const extension = filename.split(".").pop();
  return `uploads/${userId}/${timestamp}-${random}.${extension}`;
}

/**
 * Get public URL for a file
 * Note: This generates the public URL format. For temporary access, use getStorageSignedUrl instead.
 */
export function getPublicUrl(
  key: string,
  provider = getStorageProvider(),
): string {
  const resolved = resolveStorageKey(key);

  if (provider === "filesystem" || !shouldUseObjectStorage(provider)) {
    return getFilesystemPublicUrl(resolved);
  }

  if (env.CDN_BASE_URL) {
    return `${env.CDN_BASE_URL}/${resolved}`;
  }

  const bucket = getStorageBucket();
  const region = env.STORAGE_REGION ?? "us-east-1";

  if (provider === "aws") {
    return `https://${bucket}.s3.${region}.amazonaws.com/${resolved}`;
  } else if (provider === "aliyun") {
    return `https://${bucket}.${region}.aliyuncs.com/${resolved}`;
  } else if (provider === "gcs") {
    return `https://storage.googleapis.com/${bucket}/${resolved}`;
  } else if (provider === "minio") {
    const endpoint = env.STORAGE_ENDPOINT ?? "http://localhost:9000";
    return `${endpoint}/${bucket}/${resolved}`;
  } else if (provider === "r2") {
    return `https://${bucket}.r2.dev/${resolved}`;
  }

  return `${env.STORAGE_ENDPOINT}/${bucket}/${resolved}`;
}

/**
 * Upload object to storage
 */
export async function putObject(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<StoredObject> {
  const provider = getStorageProvider();

  if (!shouldUseObjectStorage(provider)) {
    logger.warn(
      { provider, key },
      "Object storage is not configured; using filesystem storage",
    );
    return putFilesystemObject(buffer, key);
  }

  const client = getStorageClient();
  const bucket = getStorageBucket();

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: resolveStorageKey(key),
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return {
      provider,
      storageKey: key,
      publicUrl: getPublicUrl(key, provider),
    };
  } catch (err: unknown) {
    // Enhance AWS error visibility
    const e = err as Record<string, unknown>;
    const meta = e?.$metadata as
      | {
          httpStatusCode?: number;
          requestId?: string;
          attempts?: number;
          totalRetryDelay?: number;
        }
      | undefined;
    logger.warn(
      {
        err: e,
        provider,
        bucket,
        key,
        contentType,
        httpStatusCode: meta?.httpStatusCode,
        requestId: meta?.requestId,
        attempts: meta?.attempts,
        totalRetryDelay: meta?.totalRetryDelay,
      },
      "Object storage upload failed; falling back to filesystem storage",
    );
    return putFilesystemObject(buffer, key);
  }
}

/**
 * Get signed URL for download (temporary access)
 * @param key - Object key
 * @param expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
 */
export async function getStorageSignedUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const provider = getStorageProvider();
  if (provider === "filesystem" || !shouldUseObjectStorage(provider)) {
    return getPublicUrl(key, "filesystem");
  }

  const client = getStorageClient();
  const bucket = getStorageBucket();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: resolveStorageKey(key),
  });

  return await getSignedUrl(client, command, { expiresIn });
}

/**
 * Generate presigned URL for upload
 * @param key - Object key
 * @param contentType - File content type
 * @param expiresIn - URL expiration time in seconds (default: 900 = 15 minutes)
 */
export async function getUploadPresignedUrl(
  key: string,
  contentType: string,
  expiresIn = 900,
): Promise<string> {
  const provider = getStorageProvider();
  if (provider === "filesystem" || !shouldUseObjectStorage(provider)) {
    throw new Error(
      "Presigned browser uploads require configured S3-compatible storage",
    );
  }

  const client = getStorageClient();
  const bucket = getStorageBucket();

  const commandInput: PutObjectCommandInput = {
    Bucket: bucket,
    Key: resolveStorageKey(key),
    ContentType: contentType,
  };

  const command = new PutObjectCommand(commandInput);

  return await getSignedUrl(client, command, { expiresIn });
}

/**
 * Generate storage key for video
 */
export function generateVideoKey(
  userId: string,
  agentId: string,
  videoId: string,
  variant: string,
): string {
  return `${userId}/videos/${agentId}/${videoId}/${variant}.mp4`;
}

/**
 * Generate storage key for thumbnail
 */
export function generateThumbnailKey(
  userId: string,
  agentId: string,
  videoId: string,
): string {
  return `${userId}/videos/${agentId}/${videoId}/thumbnail.jpg`;
}

/**
 * Generate storage key for image
 */
export function generateImageKey(
  userId: string,
  imageId: string,
  extension = "png",
): string {
  return `${userId}/images/${imageId}.${extension}`;
}

/**
 * Get object from storage as Buffer
 */
export async function getObject(key: string): Promise<Buffer> {
  const provider = getStorageProvider();

  if (provider === "filesystem" || !shouldUseObjectStorage(provider)) {
    return getFilesystemObject(key);
  }

  const client = getStorageClient();
  const bucket = getStorageBucket();

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: resolveStorageKey(key),
    });

    const response = await client.send(command);
    const stream = response.Body;

    if (!stream) {
      throw new Error(`Failed to get object: ${key}`);
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    logger.warn(
      { err, provider, key },
      "Object storage read failed; falling back to filesystem storage",
    );
    return getFilesystemObject(key);
  }
}

/**
 * Download image from URL and upload to storage
 * @returns Storage key and public URL
 */
export async function downloadAndUploadImage(
  imageUrl: string,
  userId: string,
  imageId: string,
): Promise<{ storageKey: string; publicUrl: string }> {
  logger.info({ imageUrl, userId, imageId }, "Downloading image from URL");

  // Download image
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download image: ${response.status} ${response.statusText}`,
    );
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "image/png";

  // Determine file extension from content type
  const extension = contentType.split("/")[1] ?? "png";
  const storageKey = generateImageKey(userId, imageId, extension);

  logger.info(
    { storageKey, size: imageBuffer.length },
    "Uploading image to storage",
  );

  // Upload to storage
  const stored = await putObject(imageBuffer, storageKey, contentType);

  logger.info(
    { publicUrl: stored.publicUrl, provider: stored.provider },
    "Image uploaded successfully",
  );

  return { storageKey, publicUrl: stored.publicUrl };
}

async function putFilesystemObject(
  buffer: Buffer,
  key: string,
): Promise<StoredObject> {
  const filePath = getFilesystemPath(key);

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);

  return {
    provider: "filesystem",
    storageKey: key,
    publicUrl: getPublicUrl(key, "filesystem"),
  };
}

async function getFilesystemObject(key: string): Promise<Buffer> {
  return fs.readFile(getFilesystemPath(key));
}

function getFilesystemPath(key: string): string {
  const resolvedKey = resolveStorageKey(key);
  const normalized = path.normalize(resolvedKey);

  if (
    path.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`) ||
    normalized.startsWith("../") ||
    normalized.startsWith("..\\")
  ) {
    throw new Error(`Invalid storage key: ${key}`);
  }

  return path.join(getFilesystemRoot(), normalized);
}

function getFilesystemRoot(): string {
  return path.resolve(env.STORAGE_FILESYSTEM_ROOT ?? "public/storage");
}

function getFilesystemPublicUrl(resolvedKey: string): string {
  const publicPath = `${FILESYSTEM_PUBLIC_PATH}/${encodeStoragePath(resolvedKey)}`;
  const baseUrl = env.STORAGE_FILESYSTEM_PUBLIC_BASE_URL;

  if (!baseUrl) return publicPath;
  return joinUrl(baseUrl, publicPath);
}

function encodeStoragePath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function joinUrl(baseUrl: string, publicPath: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${publicPath.replace(/^\//, "")}`;
}
