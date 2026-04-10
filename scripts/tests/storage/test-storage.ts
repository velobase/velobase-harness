/**
 * Storage Integration Test
 *
 * Tests basic storage operations (upload, download, signed URL, public URL, delete)
 * against the currently configured STORAGE_PROVIDER.
 *
 * Usage: npx tsx scripts/tests/storage/test-storage.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const provider = process.env.STORAGE_PROVIDER ?? "aws";
const region = process.env.STORAGE_REGION ?? "us-east-1";
const bucket = process.env.STORAGE_BUCKET;
const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
const endpoint = process.env.STORAGE_ENDPOINT;
const cdnBaseUrl = process.env.CDN_BASE_URL;

console.log("=== Storage Integration Test ===\n");
console.log(`Provider:  ${provider}`);
console.log(`Region:    ${region}`);
console.log(`Bucket:    ${bucket}`);
console.log(`Endpoint:  ${endpoint ?? "(default)"}`);
console.log(`CDN URL:   ${cdnBaseUrl ?? "(none)"}`);
console.log("");

if (!bucket || !accessKeyId || !secretAccessKey) {
  console.error("ERROR: Missing required env vars (STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY)");
  process.exit(1);
}

const providerConfigs: Record<string, object> = {
  aws: { region },
  aliyun: { region, endpoint, forcePathStyle: false },
  gcs: { region: "auto", endpoint: endpoint ?? "https://storage.googleapis.com" },
  minio: { region, endpoint: endpoint ?? "http://localhost:9000", forcePathStyle: true },
  r2: { region: "auto", endpoint, forcePathStyle: false },
};

const client = new S3Client({
  ...providerConfigs[provider],
  credentials: { accessKeyId, secretAccessKey },
} as ConstructorParameters<typeof S3Client>[0]);

const testKey = `_framework_test/test-${Date.now()}.txt`;
const testContent = `Hello from storage test! Provider: ${provider}, Time: ${new Date().toISOString()}`;

function getPublicUrl(key: string): string {
  if (cdnBaseUrl) return `${cdnBaseUrl}/${key}`;
  if (provider === "aws") return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  if (provider === "aliyun") return `https://${bucket}.${region}.aliyuncs.com/${key}`;
  if (provider === "gcs") return `https://storage.googleapis.com/${bucket}/${key}`;
  if (provider === "minio") return `${endpoint}/${bucket}/${key}`;
  if (provider === "r2") return `https://${bucket}.r2.dev/${key}`;
  return `${endpoint}/${bucket}/${key}`;
}

async function run() {
  let passed = 0;
  let failed = 0;

  // Test 1: Upload
  try {
    console.log(`[1/5] Upload: PUT ${testKey}`);
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: Buffer.from(testContent, "utf-8"),
      ContentType: "text/plain",
    }));
    console.log("  ✅ Upload succeeded\n");
    passed++;
  } catch (err) {
    console.error("  ❌ Upload failed:", (err as Error).message, "\n");
    failed++;
    console.log(`\nResult: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }

  // Test 2: Download and verify content
  try {
    console.log(`[2/5] Download: GET ${testKey}`);
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: testKey }));
    const body = await response.Body?.transformToString("utf-8");
    if (body === testContent) {
      console.log("  ✅ Download succeeded, content matches\n");
      passed++;
    } else {
      console.error(`  ❌ Content mismatch!\n  Expected: ${testContent}\n  Got: ${body}\n`);
      failed++;
    }
  } catch (err) {
    console.error("  ❌ Download failed:", (err as Error).message, "\n");
    failed++;
  }

  // Test 3: Presigned download URL
  try {
    console.log(`[3/5] Presigned download URL`);
    const downloadUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: testKey }), { expiresIn: 300 });
    console.log(`  ✅ Generated: ${downloadUrl.substring(0, 100)}...\n`);
    passed++;
  } catch (err) {
    console.error("  ❌ Presigned URL failed:", (err as Error).message, "\n");
    failed++;
  }

  // Test 4: Public URL format
  try {
    console.log(`[4/5] Public URL format`);
    const publicUrl = getPublicUrl(testKey);
    console.log(`  ✅ Public URL: ${publicUrl}\n`);
    passed++;
  } catch (err) {
    console.error("  ❌ Public URL failed:", (err as Error).message, "\n");
    failed++;
  }

  // Test 5: Delete
  try {
    console.log(`[5/5] Delete: ${testKey}`);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    console.log("  ✅ Delete succeeded\n");
    passed++;
  } catch (err) {
    console.error("  ❌ Delete failed:", (err as Error).message, "\n");
    failed++;
  }

  console.log("=================================");
  console.log(`Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
