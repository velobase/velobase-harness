import { db } from "../../src/server/db";
import {
  localDemoEnabled,
  localDemoEmail,
} from "../../src/server/auth/local-demo";

if (!localDemoEnabled)
  throw new Error("Local demo seed requires compose.demo.yml");

try {
  await db.user.upsert({
    where: { email: localDemoEmail },
    update: {},
    create: {
      email: localDemoEmail,
      name: "Local administrator",
      emailVerified: new Date(),
      isAdmin: true,
    },
  });
} finally {
  await db.$disconnect();
}
