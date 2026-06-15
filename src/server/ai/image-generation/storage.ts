import { createLogger } from "@/lib/logger";
import { putObject } from "@/server/storage";
import type { ImageGenerationOutputFormat } from "./types";

const logger = createLogger("image-generation-storage");

const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

export interface StoredGeneratedImage {
  sourceUrl: string;
  publicUrl: string;
  storageKey: string;
  contentType: string;
  byteLength: number;
}

export async function storeGeneratedImage(params: {
  userId: string;
  taskId: string;
  outputIndex: number;
  sourceUrl: string;
  outputFormat?: ImageGenerationOutputFormat;
}): Promise<StoredGeneratedImage> {
  const downloaded = await downloadImage(params.sourceUrl);
  const extension = getExtension(downloaded.contentType, params.outputFormat);
  const storageKey = [
    params.userId,
    "generated-images",
    params.taskId,
    `${params.outputIndex}.${extension}`,
  ].join("/");

  logger.info(
    {
      taskId: params.taskId,
      outputIndex: params.outputIndex,
      storageKey,
      byteLength: downloaded.buffer.length,
    },
    "Uploading generated image",
  );

  const stored = await putObject(
    downloaded.buffer,
    storageKey,
    downloaded.contentType,
  );

  return {
    sourceUrl: params.sourceUrl,
    publicUrl: stored.publicUrl,
    storageKey,
    contentType: downloaded.contentType,
    byteLength: downloaded.buffer.length,
  };
}

async function downloadImage(sourceUrl: string): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  if (sourceUrl.startsWith("data:")) {
    return readDataUrl(sourceUrl);
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download generated image: ${response.status} ${response.statusText}`,
    );
  }

  const contentType = normalizeContentType(
    response.headers.get("content-type"),
    sourceUrl,
  );
  assertImageContentType(contentType);

  const buffer = Buffer.from(await response.arrayBuffer());
  assertImageSize(buffer);

  return { buffer, contentType };
}

function readDataUrl(sourceUrl: string): {
  buffer: Buffer;
  contentType: string;
} {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(sourceUrl);
  if (!match) {
    throw new Error("Unsupported generated image data URL");
  }

  const contentType = match[1] ?? "image/png";
  assertImageContentType(contentType);

  const buffer = Buffer.from(match[2] ?? "", "base64");
  assertImageSize(buffer);

  return { buffer, contentType };
}

function normalizeContentType(
  contentType: string | null,
  sourceUrl: string,
): string {
  if (contentType?.startsWith("image/")) return contentType.split(";")[0]!;

  const lower = sourceUrl.toLowerCase();
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "image/jpeg";
  if (lower.includes(".webp")) return "image/webp";
  return "image/png";
}

function assertImageContentType(contentType: string): void {
  if (!contentType.startsWith("image/")) {
    throw new Error(`Generated output is not an image: ${contentType}`);
  }
}

function assertImageSize(buffer: Buffer): void {
  if (buffer.length <= 0) {
    throw new Error("Generated image is empty");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Generated image exceeds maximum supported size");
  }
}

function getExtension(
  contentType: string,
  outputFormat: ImageGenerationOutputFormat | undefined,
): string {
  if (outputFormat === "jpeg") return "jpg";
  if (outputFormat) return outputFormat;

  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
}
