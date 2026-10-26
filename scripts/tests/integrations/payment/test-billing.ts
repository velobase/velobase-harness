/**
 * Velobase Billing Integration Test
 *
 * 测试计费服务的核心操作：
 * 1. grant 幂等性 — Stripe webhook 重试不会重复发放
 * 2. 管理员扣减 — 使用 SDK 支持的 ADMIN_GRANT businessType 记录人工操作
 * 3. 初始积分全额可用 — 不存在 PENDING 锁定
 *
 * 前置条件：本地 PostgreSQL 账本已迁移、credits 功能已启用，.env 配置完成
 *
 * Usage: npx tsx scripts/tests/integrations/payment/test-billing.ts
 */

import 'dotenv/config'

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured in .env')
  console.error('   Local billing database is not usable in this environment. Test failed.\n')
  process.exit(1)
}

const testPrefix = `fix_test_${Date.now()}`
let passed = 0
let failed = 0

function ok(name: string, msg: string) {
  passed++
  console.log(`  ✅ ${name}: ${msg}`)
}
function fail(name: string, msg: string) {
  failed++
  console.log(`  ❌ ${name}: ${msg}`)
}

// ════════════════════════════════════════════════════════════════════
// 测试 1：grant() 的 isIdempotentReplay 标志
// ════════════════════════════════════════════════════════════════════
async function testGrantIdempotency() {
  console.log('\n── 1. grant 幂等标志 ──')
  console.log('场景：Stripe webhook 因网络问题重试，同一笔续费积分被发放两次')
  console.log('')

  const { grant } = await import('../../../../src/server/billing/services/grant')
  const userId = `${testPrefix}_idempotency`
  const outerBizId = `subscription_renewal_sub123_inv456`

  const first = await grant({
    userId,
    source: "membership",
    amount: 100,
    outerBizId,
    businessType: 'SUBSCRIPTION',
    description: 'Monthly credits (first call)',
  })

  if (!first.isIdempotentReplay && first.addedAmount === 100) {
    ok('首次发放', `addedAmount=${first.addedAmount}, isIdempotentReplay=${first.isIdempotentReplay}`)
  } else {
    fail('首次发放', `unexpected: addedAmount=${first.addedAmount}, isIdempotentReplay=${first.isIdempotentReplay}`)
  }

  const second = await grant({
    userId,
    source: "membership",
    amount: 100,
    outerBizId,
    businessType: 'SUBSCRIPTION',
    description: 'Monthly credits (retry)',
  })

  if (second.isIdempotentReplay) {
    ok('重试幂等', `isIdempotentReplay=true，不会重复发放`)
  } else {
    fail('重试幂等', `isIdempotentReplay=${second.isIdempotentReplay}，可能重复发放了！`)
  }

  const { getBalance } = await import('../../../../src/server/billing/services/get-balance')
  const balance = await getBalance({ userId })

  if (balance.totalSummary.available === 100) {
    ok('余额正确', `available=${balance.totalSummary.available}（不是 200）`)
  } else {
    fail('余额正确', `available=${balance.totalSummary.available}，预期 100`)
  }
}

// ════════════════════════════════════════════════════════════════════
// 测试 2：管理员扣减
// ════════════════════════════════════════════════════════════════════
async function testAdminDeduct() {
  console.log('\n── 2. 管理员扣减 ──')
  console.log('场景：管理员手动扣减用户积分 / 滥用检测回收积分')
  console.log('')

  const { grant } = await import('../../../../src/server/billing/services/grant')
  const { postConsume } = await import('../../../../src/server/billing/services/post-consume')
  const { getRecords } = await import('../../../../src/server/billing/services/get-records')

  const userId = `${testPrefix}_admin_deduct`

  await grant({
    userId,
    source: "first_login",
    amount: 50,
    outerBizId: `test_grant_${userId}`,
    businessType: 'ADMIN_GRANT',
    description: 'Test grant for admin deduct',
  })

  await postConsume({
    userId,
    amount: 10,
    businessId: `admin_deduct_${userId}_${Date.now()}`,
    businessType: "ADMIN_GRANT",
    description: 'Admin manual deduction test',
  })

  const records = await getRecords({ userId, limit: 10 })
  const deductRecord = records.records.find(r =>
    r.description?.includes('Admin manual deduction')
  )

  if (deductRecord) {
    if (deductRecord.businessType === 'ADMIN_GRANT') {
      ok('businessType', `ADMIN_GRANT（通过 description 区分扣减场景）`)
    } else {
      fail('businessType 映射', `businessType="${deductRecord.businessType}"，预期 ADMIN_GRANT`)
    }
    ok('description 保留', `description="${deductRecord.description}"`)
  } else {
    fail('扣减记录', '未找到扣减流水')
  }

  const { getBalance } = await import('../../../../src/server/billing/services/get-balance')
  const balance = await getBalance({ userId })

  if (balance.totalSummary.available === 40) {
    ok('余额正确', `50 - 10 = ${balance.totalSummary.available}`)
  } else {
    fail('余额正确', `available=${balance.totalSummary.available}，预期 40`)
  }
}

// ════════════════════════════════════════════════════════════════════
// 测试 3：初始积分全额可用 + 回收
// ════════════════════════════════════════════════════════════════════
async function testNoPendingStatus() {
  console.log('\n── 3. 初始积分全额可用 + 回收 ──')
  console.log('场景：新用户注册后获得欢迎积分，应全额可用；滥用检测后应可回收')
  console.log('')

  const { grant } = await import('../../../../src/server/billing/services/grant')
  const { getBalance } = await import('../../../../src/server/billing/services/get-balance')

  const userId = `${testPrefix}_no_pending`

  await grant({
    userId,
    source: "first_login",
    amount: 500,
    outerBizId: `initial_grant_${userId}`,
    businessType: 'ADMIN_GRANT',
    description: 'Welcome Gift: 500 Credits',
  })

  const balance = await getBalance({ userId })

  if (balance.totalSummary.available === 500) {
    ok('全额可用', `available=${balance.totalSummary.available}（没有 PENDING 锁定）`)
  } else {
    fail('全额可用', `available=${balance.totalSummary.available}，预期 500`)
  }

  const { postConsume } = await import('../../../../src/server/billing/services/post-consume')
  await postConsume({
    userId,
    amount: 500,
    businessId: `abuse_clawback_${userId}_${Date.now()}`,
    businessType: "ADMIN_GRANT",
    description: 'Abuse clawback: same IP detected',
  })

  const afterClawback = await getBalance({ userId })

  if (afterClawback.totalSummary.available === 0) {
    ok('回收成功', `available=${afterClawback.totalSummary.available}（积分已回收）`)
  } else {
    fail('回收成功', `available=${afterClawback.totalSummary.available}，预期 0`)
  }
}

// ════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════')
  console.log('  Velobase Billing 集成测试')
  console.log('═══════════════════════════════════════════')

  await testGrantIdempotency()
  await testAdminDeduct()
  await testNoPendingStatus()

  console.log('\n───────────────────────────────────────────')
  console.log(`  结果: ${passed} 通过, ${failed} 失败`)
  console.log('───────────────────────────────────────────\n')

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Test error:', err)
  process.exit(1)
})
