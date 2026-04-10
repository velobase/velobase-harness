/**
 * Database integration test
 * Verifies: table structure (schema sync) + seed data completeness
 *
 * Usage: npx tsx scripts/tests/database/test-database.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function testTableStructure() {
  console.log("\n═══ 1. 表结构验证 ═══\n");

  const expectedTables = [
    // Auth
    "accounts", "sessions", "users", "verification_tokens",
    // Product & Payment
    "products", "product_prices", "orders", "payments",
    "payment_webhook_logs", "payment_transactions",
    // Billing
    "billing_billing_accounts", "billing_billing_records", "billing_billing_freeze_records",
    // Subscription
    "membership_user_subscriptions", "membership_user_subscription_cycles",
    "product_subscription_plans", "product_product_subscriptions",
    // Entitlement
    "membership_user_entitlements", "product_entitlements",
    "product_plan_entitlements", "product_product_one_time_entitlements",
    "product_product_credits_packages",
    // Promo
    "promo_codes", "promo_code_redemptions",
    // Task
    "task_tasks",
    // AI Chat
    "conversations", "interactions", "agents", "user_agents",
    // Content
    "projects", "documents", "project_quality_scores", "image_assets",
    // GitHub
    "github_connections", "github_repositories",
    // Misc
    "posts", "activation_codes",
    // User extras
    "user_stats", "user_offers", "user_attributions",
    // Affiliate
    "affiliate_accounts", "affiliate_ledger_entries",
    "affiliate_earnings", "affiliate_payout_requests",
    // Touch
    "touch_scenes", "touch_templates", "touch_schedules", "touch_records",
    // Notification
    "user_notification_preferences",
    // Support
    "support_tickets", "support_timeline", "support_sync_cursors",
  ];

  const result = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  const actualTables = result.map((r) => r.tablename);

  console.log(`  数据库中共 ${actualTables.length} 张表\n`);

  for (const table of expectedTables) {
    assert(`表 ${table}`, actualTables.includes(table), "不存在");
  }

  const extra = actualTables.filter(
    (t) => !expectedTables.includes(t) && t !== "_prisma_migrations"
  );
  if (extra.length > 0) {
    console.log(`\n  ℹ️ 额外的表（未在检查列表中）: ${extra.join(", ")}`);
  }
}

async function testSeedAgents() {
  console.log("\n═══ 2. Seed: Agents ═══\n");

  const agents = await prisma.agent.findMany({ where: { isSystem: true } });
  assert("系统 Agent 数量 >= 6", agents.length >= 6, `实际 ${agents.length}`);

  const defaultAgent = await prisma.agent.findFirst({
    where: { id: "agent_vibe_creator" },
  });
  assert("默认 AI 助手存在 (agent_vibe_creator)", !!defaultAgent);
}

async function testSeedProducts() {
  console.log("\n═══ 3. Seed: Products ═══\n");

  const products = await prisma.product.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
  });
  assert("活跃产品数量 > 0", products.length > 0, `实际 ${products.length}`);

  const subscriptions = products.filter((p) => p.type === "SUBSCRIPTION");
  assert("订阅产品 >= 1", subscriptions.length >= 1, `实际 ${subscriptions.length}`);

  const credits = products.filter((p) => p.type === "CREDITS_PACKAGE");
  assert("积分包产品 >= 1", credits.length >= 1, `实际 ${credits.length}`);

  const prices = await prisma.productPrice.findMany();
  assert("多币种价格条目 > 0", prices.length > 0, `实际 ${prices.length}`);

  const currencies = [...new Set(prices.map((p) => p.currency))];
  assert("支持币种 >= 2", currencies.length >= 2, `实际: ${currencies.join(", ")}`);
}

async function testSeedPlans() {
  console.log("\n═══ 4. Seed: Subscription Plans ═══\n");

  const plans = await prisma.subscriptionPlan.findMany({
    where: { deletedAt: null },
  });
  assert("订阅计划数量 >= 1", plans.length >= 1, `实际 ${plans.length}`);

  const entitlements = await prisma.entitlement.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
  });
  assert("权益定义数量 >= 1", entitlements.length >= 1, `实际 ${entitlements.length}`);

  const planEntitlements = await prisma.planEntitlement.findMany();
  assert("计划-权益绑定 >= 1", planEntitlements.length >= 1, `实际 ${planEntitlements.length}`);
}

async function testSeedTouchScenes() {
  console.log("\n═══ 5. Seed: Touch Scenes ═══\n");

  const scenes = await prisma.touchScene.findMany();
  assert("触达场景 >= 1", scenes.length >= 1, `实际 ${scenes.length}`);

  const templates = await prisma.touchTemplate.findMany();
  assert("触达模板 >= 1", templates.length >= 1, `实际 ${templates.length}`);
}

async function testSeedTestUser() {
  console.log("\n═══ 6. Seed: Test User ═══\n");

  const testUser = await prisma.user.findUnique({
    where: { email: "testadmin@example.com" },
  });
  assert("测试用户 testadmin@example.com 存在", !!testUser);
  if (testUser) {
    assert("测试用户有密码哈希", !!testUser.passwordHash);
  }
}

async function testRedisConnection() {
  console.log("\n═══ 7. Redis 连通性 ═══\n");

  const host = process.env.REDIS_HOST ?? "127.0.0.1";
  const port = parseInt(process.env.REDIS_PORT ?? "6379");
  const password = process.env.REDIS_PASSWORD || undefined;

  const client = new Redis({
    host,
    port,
    password,
    db: parseInt(process.env.REDIS_DB ?? "0"),
    lazyConnect: true,
  });

  try {
    await client.connect();
    const pong = await client.ping();
    assert("Redis PING", pong === "PONG", `返回: ${pong}`);

    await client.set("framework_test_key", "hello");
    const val = await client.get("framework_test_key");
    assert("Redis SET/GET", val === "hello", `返回: ${val}`);

    await client.del("framework_test_key");
    assert("Redis DEL", true);
  } catch (err: any) {
    assert("Redis 连接", false, err.message);
  } finally {
    client.disconnect();
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Database Integration Test              ║");
  console.log("╚══════════════════════════════════════════╝");

  try {
    await testTableStructure();
    await testSeedAgents();
    await testSeedProducts();
    await testSeedPlans();
    await testSeedTouchScenes();
    await testSeedTestUser();
    await testRedisConnection();
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n══════════════════════════════════════════");
  console.log(`  结果: ${passed} passed, ${failed} failed`);
  console.log("══════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main();
