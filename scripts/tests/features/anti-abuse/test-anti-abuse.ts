/**
 * Anti-Abuse Feature Test
 *
 * 测试注册反滥用守卫的完整流程：
 * 1. Email Guard — 邮箱验证拦截
 * 2. Signup Guard — 同 IP / 同设备检测
 * 3. 积分回收 — enforceSignupAbuse 端到端
 *
 * 前置条件：
 * - 本地 PostgreSQL 运行中（docker:up）
 * - 本地积分账本已迁移、credits 功能已启用
 * - .env 配置完成
 *
 * Usage: npx tsx scripts/tests/features/anti-abuse/test-anti-abuse.ts
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured in .env')
  console.error('   Database is not usable in this environment. Test failed.\n')
  process.exit(1)
}

const prisma = new PrismaClient()
const testPrefix = `abuse_test_${Date.now()}`
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
// 辅助：创建测试用户（写入数据库，供 signup-guard 查询）
// ════════════════════════════════════════════════════════════════════

async function createTestUser(opts: {
  id: string
  email: string
  signupIp: string
  deviceKey?: string
  isPrimary?: boolean
  isBlocked?: boolean
  createdAt?: Date
}) {
  await prisma.user.create({
    data: {
      id: opts.id,
      email: opts.email,
      signupIp: opts.signupIp,
      deviceKeyAtSignup: opts.deviceKey ?? null,
      isPrimaryDeviceAccount: opts.isPrimary ?? true,
      isBlocked: opts.isBlocked ?? false,
      createdAt: opts.createdAt ?? new Date(),
    },
  })
}

// ════════════════════════════════════════════════════════════════════
// 测试 1：Email Guard — 临时邮箱拦截
// ════════════════════════════════════════════════════════════════════
async function testEmailGuardDisposable() {
  console.log('\n── 1.1 Email Guard：临时邮箱拦截 ──')
  console.log('场景：灰产使用临时邮箱注册薅积分')
  console.log('')

  const { guardEmail } = await import('../../../../src/server/features/anti-abuse')

  try {
    await guardEmail('test@mailinator.com', '1.2.3.4')
    fail('临时邮箱', '应该被拦截但没有')
  } catch (err) {
    const msg = (err as Error).message
    if (msg.startsWith('DISPOSABLE_EMAIL:')) {
      ok('临时邮箱', `正确拦截: ${msg}`)
    } else {
      fail('临时邮箱', `错误类型: ${msg}`)
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// 测试 1.2：Email Guard — Gmail Dot Trick
// ════════════════════════════════════════════════════════════════════
async function testEmailGuardGmailDotTrick() {
  console.log('\n── 1.2 Email Guard：Gmail Dot Trick ──')
  console.log('场景：灰产用 p.e.a.c.h@gmail.com 这种多点变体批量注册')
  console.log('')

  const { guardEmail } = await import('../../../../src/server/features/anti-abuse')

  try {
    await guardEmail('p.e.a.c.h@gmail.com', '1.2.3.4')
    fail('Gmail dot trick', '应该被拦截但没有')
  } catch (err) {
    const msg = (err as Error).message
    if (msg.startsWith('SUSPICIOUS_EMAIL:')) {
      ok('Gmail dot trick', `正确拦截 (4个点): ${msg}`)
    } else {
      fail('Gmail dot trick', `错误类型: ${msg}`)
    }
  }

  // 正常 Gmail（1 个点：first.last 格式）应该通过
  try {
    await guardEmail('john.doe@gmail.com', '1.2.3.4')
    ok('正常 Gmail', 'first.last@gmail.com 正确放行')
  } catch (err) {
    const msg = (err as Error).message
    // Turnstile 拦截是预期的（本地没有配置 token），不算失败
    if (msg.startsWith('TURNSTILE_')) {
      ok('正常 Gmail', 'first.last@gmail.com 放行到 Turnstile 阶段（邮箱检查通过）')
    } else {
      fail('正常 Gmail', `不应该被拦截: ${msg}`)
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// 测试 1.3：Email Guard — Gmail Alias
// ════════════════════════════════════════════════════════════════════
async function testEmailGuardGmailAlias() {
  console.log('\n── 1.3 Email Guard：Gmail Alias ──')
  console.log('场景：灰产用 user+1@gmail.com, user+2@gmail.com 批量注册')
  console.log('')

  const { guardEmail } = await import('../../../../src/server/features/anti-abuse')

  try {
    await guardEmail('realuser+freebie@gmail.com', '1.2.3.4')
    fail('Gmail alias', '应该被拦截但没有')
  } catch (err) {
    const msg = (err as Error).message
    if (msg.startsWith('GMAIL_ALIAS_DETECTED:')) {
      ok('Gmail alias', `正确拦截: ${msg}`)
    } else {
      fail('Gmail alias', `错误类型: ${msg}`)
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// 测试 1.4：Email Guard — 超长邮箱
// ════════════════════════════════════════════════════════════════════
async function testEmailGuardLongEmail() {
  console.log('\n── 1.4 Email Guard：超长邮箱 ──')
  console.log('场景：脚本生成的超长随机邮箱地址')
  console.log('')

  const { guardEmail } = await import('../../../../src/server/features/anti-abuse')

  const longLocal = 'a'.repeat(31) // 31 > 30 的阈值
  try {
    await guardEmail(`${longLocal}@example.com`, '1.2.3.4')
    fail('超长邮箱', '应该被拦截但没有')
  } catch (err) {
    const msg = (err as Error).message
    if (msg.startsWith('SUSPICIOUS_EMAIL:')) {
      ok('超长邮箱', `正确拦截 (${longLocal.length} 字符): ${msg}`)
    } else {
      fail('超长邮箱', `错误类型: ${msg}`)
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// 测试 2.1：Signup Guard — 正常用户（独立 IP）
// ════════════════════════════════════════════════════════════════════
async function testSignupGuardCleanUser() {
  console.log('\n── 2.1 Signup Guard：正常用户 ──')
  console.log('场景：一个全新 IP 上的首个注册用户，不应被判滥用')
  console.log('')

  const { checkSignupAbuse } = await import('../../../../src/server/features/anti-abuse')

  const userId = `${testPrefix}_clean_1`
  const ip = `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`

  await createTestUser({
    id: userId,
    email: `${userId}@test.com`,
    signupIp: ip,
    deviceKey: `dev_${userId}`,
    isPrimary: true,
  })

  const result = await checkSignupAbuse({ userId, email: `${userId}@test.com`, signupIp: ip })

  if (!result.isAbuse) {
    ok('正常用户', `isAbuse=false, reason=${result.reason}`)
  } else {
    fail('正常用户', `不应判为滥用: reason=${result.reason}`)
  }
}

// ════════════════════════════════════════════════════════════════════
// 测试 2.2：Signup Guard — 同设备多号
// ════════════════════════════════════════════════════════════════════
async function testSignupGuardSameDevice() {
  console.log('\n── 2.2 Signup Guard：同设备多号 ──')
  console.log('场景：同一个浏览器上注册了两个账号（isPrimaryDeviceAccount=false）')
  console.log('')

  const { checkSignupAbuse } = await import('../../../../src/server/features/anti-abuse')

  const userId = `${testPrefix}_device_2`
  const ip = `10.1.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`

  await createTestUser({
    id: userId,
    email: `${userId}@test.com`,
    signupIp: ip,
    deviceKey: 'shared_device_key',
    isPrimary: false,
  })

  const result = await checkSignupAbuse({ userId, email: `${userId}@test.com`, signupIp: ip })

  if (result.isAbuse && result.reason === 'NON_PRIMARY_DEVICE_ACCOUNT') {
    ok('同设备多号', `正确判定: reason=${result.reason}`)
  } else {
    fail('同设备多号', `预期 NON_PRIMARY_DEVICE_ACCOUNT, 实际: isAbuse=${result.isAbuse}, reason=${result.reason}`)
  }
}

// ════════════════════════════════════════════════════════════════════
// 测试 2.3：Signup Guard — 同 IP 短时密集注册
// ════════════════════════════════════════════════════════════════════
async function testSignupGuardSameIpBurst() {
  console.log('\n── 2.3 Signup Guard：同 IP 短时密集注册 ──')
  console.log('场景：同一个 IP 在 24 小时内注册了 2 个账号')
  console.log('')

  const { checkSignupAbuse } = await import('../../../../src/server/features/anti-abuse')

  const sharedIp = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
  const now = new Date()

  // 先行账号（10 分钟前注册）
  const priorUserId = `${testPrefix}_prior_3`
  await createTestUser({
    id: priorUserId,
    email: `${priorUserId}@test.com`,
    signupIp: sharedIp,
    deviceKey: `dev_${priorUserId}`,
    isPrimary: true,
    createdAt: new Date(now.getTime() - 10 * 60 * 1000),
  })

  // 当前用户（刚注册）
  const currentUserId = `${testPrefix}_current_3`
  await createTestUser({
    id: currentUserId,
    email: `${currentUserId}@test.com`,
    signupIp: sharedIp,
    deviceKey: `dev_${currentUserId}`,
    isPrimary: true,
    createdAt: now,
  })

  const result = await checkSignupAbuse({
    userId: currentUserId,
    email: `${currentUserId}@test.com`,
    signupIp: sharedIp,
  })

  if (result.isAbuse) {
    ok('同 IP 密集注册', `正确判定: reason=${result.reason}`)
    if (result.existingEmails && result.existingEmails.length > 0) {
      ok('关联邮箱', `检出 ${result.existingEmails.length} 个关联邮箱`)
    }
  } else {
    fail('同 IP 密集注册', `应判为滥用: reason=${result.reason}`)
  }
}

// ════════════════════════════════════════════════════════════════════
// 测试 2.4：Signup Guard — 无 IP 信息（安全降级）
// ════════════════════════════════════════════════════════════════════
async function testSignupGuardNoIp() {
  console.log('\n── 2.4 Signup Guard：无 IP 信息 ──')
  console.log('场景：代理/CDN 没有转发客户端 IP，不应误伤')
  console.log('')

  const { checkSignupAbuse } = await import('../../../../src/server/features/anti-abuse')

  const result = await checkSignupAbuse({
    userId: `${testPrefix}_noip`,
    email: 'noip@test.com',
    signupIp: 'unknown',
  })

  if (!result.isAbuse && result.reason === 'NO_SIGNUP_IP') {
    ok('无 IP 降级', `安全放行: reason=${result.reason}`)
  } else {
    fail('无 IP 降级', `不应判滥用: isAbuse=${result.isAbuse}, reason=${result.reason}`)
  }
}

// ════════════════════════════════════════════════════════════════════
// 测试 3：enforceSignupAbuse 端到端 — 积分回收
// ════════════════════════════════════════════════════════════════════
async function testEnforceClawback() {
  console.log('\n── 3. enforceSignupAbuse 端到端：积分回收 ──')
  console.log('场景：同设备多号用户注册后获得 500 积分，检测到滥用后应被全额回收')
  console.log('')

  const { enforceSignupAbuse } = await import('../../../../src/server/features/anti-abuse')
  const { grant } = await import('../../../../src/server/billing/services/grant')
  const { getBalance } = await import('../../../../src/server/billing/services/get-balance')

  const userId = `${testPrefix}_enforce_1`
  const ip = `172.16.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`

  // 创建一个 isPrimary=false 的用户（必定判定为滥用）
  await createTestUser({
    id: userId,
    email: `${userId}@test.com`,
    signupIp: ip,
    isPrimary: false,
  })

  // 模拟已发放 500 初始积分
  await grant({
    userId,
    source: "first_login",
    amount: 500,
    outerBizId: `initial_grant_${userId}`,
    businessType: 'ADMIN_GRANT',
    description: 'Welcome Gift: 500 Credits',
  })

  // 确认发放成功
  const before = await getBalance({ userId })
  if (before.totalSummary.available === 500) {
    ok('初始积分发放', `available=${before.totalSummary.available}`)
  } else {
    fail('初始积分发放', `available=${before.totalSummary.available}，预期 500`)
  }

  // 执行 enforceSignupAbuse
  const isAbuse = await enforceSignupAbuse(userId, `${userId}@test.com`, ip)

  if (isAbuse) {
    ok('滥用判定', 'enforceSignupAbuse 返回 true')
  } else {
    fail('滥用判定', 'enforceSignupAbuse 应返回 true')
  }

  // 验证积分已被回收
  const after = await getBalance({ userId })
  if (after.totalSummary.available === 0) {
    ok('积分回收', `available=${after.totalSummary.available}（全部回收）`)
  } else {
    fail('积分回收', `available=${after.totalSummary.available}，预期 0`)
  }
}

// ════════════════════════════════════════════════════════════════════
// 测试 3.2：enforceSignupAbuse — 正常用户积分不受影响
// ════════════════════════════════════════════════════════════════════
async function testEnforceNoClawback() {
  console.log('\n── 3.2 enforceSignupAbuse：正常用户积分不受影响 ──')
  console.log('场景：独立 IP 的正常用户，积分不应被回收')
  console.log('')

  const { enforceSignupAbuse } = await import('../../../../src/server/features/anti-abuse')
  const { grant } = await import('../../../../src/server/billing/services/grant')
  const { getBalance } = await import('../../../../src/server/billing/services/get-balance')

  const userId = `${testPrefix}_enforce_2`
  const ip = `172.17.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`

  await createTestUser({
    id: userId,
    email: `${userId}@test.com`,
    signupIp: ip,
    deviceKey: `dev_${userId}`,
    isPrimary: true,
  })

  await grant({
    userId,
    source: "first_login",
    amount: 300,
    outerBizId: `initial_grant_${userId}`,
    businessType: 'ADMIN_GRANT',
    description: 'Welcome Gift: 300 Credits',
  })

  const isAbuse = await enforceSignupAbuse(userId, `${userId}@test.com`, ip)

  if (!isAbuse) {
    ok('非滥用判定', 'enforceSignupAbuse 返回 false')
  } else {
    fail('非滥用判定', 'enforceSignupAbuse 不应返回 true')
  }

  const after = await getBalance({ userId })
  if (after.totalSummary.available === 300) {
    ok('积分保留', `available=${after.totalSummary.available}（未被回收）`)
  } else {
    fail('积分保留', `available=${after.totalSummary.available}，预期 300`)
  }
}

// ════════════════════════════════════════════════════════════════════
// 清理测试数据
// ════════════════════════════════════════════════════════════════════
async function cleanup() {
  try {
    await prisma.user.deleteMany({
      where: { id: { startsWith: testPrefix } },
    })
  } catch {
    // 清理失败不影响结果
  }
}

// ════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════')
  console.log('  注册反滥用守卫测试 (Anti-Abuse Guard)')
  console.log('═══════════════════════════════════════════')

  try {
    // Email Guard 测试（不需要数据库中有测试用户）
    await testEmailGuardDisposable()
    await testEmailGuardGmailDotTrick()
    await testEmailGuardGmailAlias()
    await testEmailGuardLongEmail()

    // Signup Guard 测试（需要数据库中创建测试用户）
    await testSignupGuardCleanUser()
    await testSignupGuardSameDevice()
    await testSignupGuardSameIpBurst()
    await testSignupGuardNoIp()

    // 端到端测试（Signup Guard + Velobase Billing）
    await testEnforceClawback()
    await testEnforceNoClawback()
  } finally {
    await cleanup()
    await prisma.$disconnect()
  }

  console.log('\n───────────────────────────────────────────')
  console.log(`  结果: ${passed} 通过, ${failed} 失败`)
  console.log('───────────────────────────────────────────\n')

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Test error:', err)
  cleanup().finally(() => prisma.$disconnect())
  process.exit(1)
})
