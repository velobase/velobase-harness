/* eslint-disable no-console */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PASSWORD_LOGIN_ALLOWLIST } from "../src/server/auth/password-login-allowlist";
import { env } from "../src/env.js";

const prisma = new PrismaClient();

export async function seedPasswordLoginTestUsers() {
  if (env.NODE_ENV === "production") {
    console.log("   ℹ️  Password-login users are never seeded in production");
    return;
  }

  if (PASSWORD_LOGIN_ALLOWLIST.length === 0) {
    console.log("   ℹ️  No password login users configured, skipping");
    return;
  }

  const seedPassword = env.PASSWORD_LOGIN_SEED_PASSWORD;
  if (!seedPassword) {
    console.log("   ℹ️  PASSWORD_LOGIN_SEED_PASSWORD is not set, skipping");
    return;
  }

  const passwordHash = await bcrypt.hash(seedPassword, 12);

  for (const testEmail of PASSWORD_LOGIN_ALLOWLIST) {
    try {
      const localPart = testEmail.split("@")[0] ?? "Test";

      await prisma.user.upsert({
        where: { email: testEmail },
        update: { passwordHash, isBlocked: false },
        create: {
          email: testEmail,
          name: `${localPart.charAt(0).toUpperCase() + localPart.slice(1)} Test`,
          passwordHash,
          emailVerified: new Date(),
          isAdmin: false,
          isBlocked: false,
        },
      });

      console.log(`   ✅ Seeded password-login user ${testEmail}`);
    } catch (error) {
      console.warn(`   ⚠️ Failed to seed ${testEmail}:`, error);
    }
  }
}
