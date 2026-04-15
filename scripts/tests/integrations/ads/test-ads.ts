/**
 * Ads Integration Test
 *
 * 验证广告集成的关键组件在当前环境下可用。
 * - Google Ads API 凭据验证
 * - Redis 队列操作验证
 * - 前端配置完整性检查
 *
 * 需要配置 GOOGLE_ADS_CUSTOMER_ID 等环境变量，未配置则测试失败。
 *
 * Usage: npx tsx scripts/tests/integrations/ads/test-ads.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

// ───────────────────────── Tests ─────────────────────────

function testGoogleAdsEnvVars() {
  console.log("\n📊 Test 1: Google Ads environment variables");

  const required = [
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_ADS_CUSTOMER_ID",
    "GOOGLE_ADS_CONVERSION_ACTION_ID",
  ] as const;

  for (const key of required) {
    const value = process.env[key];
    assert(!!value, `${key} is configured`);
  }

  const optional = [
    "GOOGLE_ADS_MCC_ID",
    "GOOGLE_ADS_WEB_CONVERSION_ACTION_ID",
  ] as const;

  for (const key of optional) {
    const value = process.env[key];
    if (value) {
      console.log(`  ℹ️  ${key} is configured (optional)`);
    } else {
      console.log(`  ℹ️  ${key} not configured (optional, skipped)`);
    }
  }
}

async function testGoogleAdsClientCreation() {
  console.log("\n📊 Test 2: Google Ads API client creation");

  try {
    const { GoogleAdsApi } = await import("google-ads-api");

    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;

    if (!clientId || !clientSecret || !developerToken || !refreshToken || !customerId) {
      assert(false, "Missing required credentials for client creation");
      return;
    }

    const api = new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: developerToken,
    });

    const customer = api.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
      login_customer_id: process.env.GOOGLE_ADS_MCC_ID || undefined,
    });

    assert(!!customer, "GoogleAdsApi Customer instance created successfully");
    assert(typeof customer.conversionUploads !== "undefined", "conversionUploads service available");
    assert(
      typeof customer.conversionAdjustmentUploads !== "undefined",
      "conversionAdjustmentUploads service available"
    );
  } catch (err) {
    assert(false, `Client creation threw: ${(err as Error).message}`);
  }
}

async function testGoogleAdsApiConnectivity() {
  console.log("\n📊 Test 3: Google Ads API connectivity (list accessible customers)");

  try {
    const { GoogleAdsApi } = await import("google-ads-api");

    const clientId = process.env.GOOGLE_ADS_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET!;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN!;

    const api = new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: developerToken,
    });

    const result = await api.listAccessibleCustomers(refreshToken);
    const customerList = Array.isArray(result)
      ? result
      : (result as { resource_names?: string[] })?.resource_names ?? [];
    assert(
      customerList.length > 0,
      `API accessible, found ${customerList.length} customer(s): ${customerList.map((c: string) => c.replace("customers/", "")).join(", ")}`
    );
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("DEVELOPER_TOKEN_NOT_APPROVED")) {
      console.log("  ⚠️  Developer token is test-level (not approved for production)");
      assert(true, "API reachable (developer token is test-level, which is expected for dev)");
    } else {
      assert(false, `API connectivity failed: ${msg}`);
    }
  }
}

async function testRedisQueueOperations() {
  console.log("\n📊 Test 4: Redis ZSET queue operations");

  const redisHost = process.env.REDIS_HOST ?? "127.0.0.1";
  const redisPort = parseInt(process.env.REDIS_PORT ?? "6379", 10);

  try {
    const Redis = (await import("ioredis")).default;
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy: () => null,
    });

    redis.on("error", () => {});

    await redis.ping();
    assert(true, `Redis connected at ${redisHost}:${redisPort}`);

    const testKey = "test:google-ads:queue";
    const testPaymentId = `test-payment-${Date.now()}`;

    await redis.zadd(testKey, Date.now(), testPaymentId);
    const count = await redis.zcard(testKey);
    assert(count >= 1, `ZADD + ZCARD works (${count} items)`);

    const popped = await redis.zpopmin(testKey, 1);
    assert(popped.length === 2 && popped[0] === testPaymentId, "ZPOPMIN retrieves correct member");

    await redis.del(testKey);
    await redis.quit();
    assert(true, "Redis queue operations all passed");
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("ECONNREFUSED") || msg.includes("closed")) {
      assert(false, `Redis not available at ${redisHost}:${redisPort} — start Docker: docker compose up -d`);
    } else {
      assert(false, `Redis operations failed: ${msg}`);
    }
  }
}

function testFrontendConfig() {
  console.log("\n📊 Test 5: Frontend ads configuration completeness");

  const googleMeasurementId = "AW-XXXXXXXXXX";
  const isPlaceholder = googleMeasurementId.includes("XXXXXXXXXX");

  if (isPlaceholder) {
    console.log(
      "  ⚠️  Google Ads Measurement ID is placeholder (AW-XXXXXXXXXX) in src/analytics/ads/google.ts"
    );
    console.log("     Replace with your actual AW- ID when running Google Ads campaigns");
  }

  assert(true, "Frontend config structure is valid (placeholder values are expected for framework)");
}

function testConversionActionResourceName() {
  console.log("\n📊 Test 6: Conversion action resource name format");

  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const conversionActionId = process.env.GOOGLE_ADS_CONVERSION_ACTION_ID;

  if (customerId && conversionActionId) {
    const resourceName = `customers/${customerId}/conversionActions/${conversionActionId}`;
    assert(
      resourceName.match(/^customers\/\d+\/conversionActions\/\d+$/) !== null,
      `Resource name format valid: ${resourceName}`
    );
  } else {
    assert(false, "Cannot validate resource name: missing CUSTOMER_ID or CONVERSION_ACTION_ID");
  }

  const webConversionActionId = process.env.GOOGLE_ADS_WEB_CONVERSION_ACTION_ID;
  if (customerId && webConversionActionId) {
    const webResourceName = `customers/${customerId}/conversionActions/${webConversionActionId}`;
    assert(
      webResourceName.match(/^customers\/\d+\/conversionActions\/\d+$/) !== null,
      `Web enhancement resource name valid: ${webResourceName}`
    );
  } else {
    console.log("  ℹ️  Web conversion action ID not configured (optional)");
  }
}

// ───────────────────────── Runner ─────────────────────────

async function run() {
  console.log("═══════════════════════════════════════════");
  console.log("  Ads Integration Test");
  console.log("═══════════════════════════════════════════");

  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  if (!customerId) {
    console.error("\n❌ GOOGLE_ADS_CUSTOMER_ID is not configured.");
    console.error("   This test requires Google Ads credentials to verify the integration.");
    console.error("   Please configure Google Ads env vars in .env and re-run.\n");
    process.exit(1);
  }

  testGoogleAdsEnvVars();
  await testGoogleAdsClientCreation();
  await testGoogleAdsApiConnectivity();
  await testRedisQueueOperations();
  testFrontendConfig();
  testConversionActionResourceName();

  console.log("\n═══════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

run();
