/**
 * Main seed script
 * 
 * Usage:
 *   npx tsx prisma/seed.ts
 *   npx prisma db seed
 */
/* eslint-disable no-console */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedAgentApps } from './seed-agent-apps';
import { seedVibeCreatorAgent } from './seed-vibe-creator-agent';
import { seedProducts } from './seed-products';
import { seedPasswordLoginTestUsers } from './seed-password-login-users';
import { seedTouchScenes } from './seed-touch-scenes';

const prisma = new PrismaClient();
const isTemplateBuild = process.env.TEMPLATE_BUILD === '1';

async function main() {
  if (isTemplateBuild) {
    console.log('🏗️  Template build mode — seeding shared data only\n');
  } else {
    console.log('🌱 Starting database seeding...\n');
  }

  // 1. Seed default AI assistant agent
  console.log('📦 Step 1: Seeding default AI assistant agent...');
  await seedVibeCreatorAgent();
  console.log('');

  // 2. Seed other System Agents
  console.log('📦 Step 2: Seeding other System Agents...');
  await seedAgentApps();
  console.log('');

  // 3. Seed Products (subscription plans and credit packages)
  console.log('📦 Step 3: Seeding Products...');
  await seedProducts();
  console.log('');

  if (!isTemplateBuild) {
    // 4. Set Admin User (update the email below to your own)
    console.log('👑 Step 4: Setting Admin User...');
    const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
    try {
      const user = await prisma.user.findUnique({ where: { email: adminEmail } });
      if (user) {
        await prisma.user.update({
          where: { email: adminEmail },
          data: { isAdmin: true },
        });
        console.log(`   ✅ Set ${adminEmail} as admin`);
      } else {
        console.log(`   ℹ️ User ${adminEmail} not found, skipping admin promotion`);
      }
    } catch (error) {
      console.warn(`   ⚠️ Failed to set admin for ${adminEmail}:`, error);
    }
    console.log('');

    // 5. Seed Password Login Test Users (optional)
    console.log('🔐 Step 5: Seeding Password Login Test Users...');
    await seedPasswordLoginTestUsers();
    console.log('');
  } else {
    console.log('⏭️  Step 4-5: Skipped (admin promotion & test users) in template mode\n');
  }

  // 6. Seed Touch Scenes (notification templates)
  console.log('📧 Step 6: Seeding Touch Scenes...');
  await seedTouchScenes();
  console.log('');

  console.log('✨ Database seeding completed successfully!\n');
  if (!isTemplateBuild) {
    console.log('🎉 You now have:');
    console.log('   - System Agents for AI chat');
    console.log('   - Products (subscriptions + credit packages)');
    console.log('   - Touch Scenes (notification templates)');
    console.log('\n💡 Users can now install agents and purchase subscriptions!\n');
  }
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
