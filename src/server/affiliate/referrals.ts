import { z } from "zod";
import { db } from "@/server/db";

/** Signup events reach this adapter only when the deployed affiliate feature is enabled. */
export async function bindNewUserReferral(userId: string, input: unknown) {
  const parsed = z.string().trim().min(1).max(64).safeParse(input);
  if (!parsed.success) return;
  const referrer = await db.user.findFirst({
    where: { referralCode: parsed.data, isBlocked: false },
    select: { id: true },
  });
  if (!referrer || referrer.id === userId) return;
  await db.user.updateMany({
    where: { id: userId, referredById: null },
    data: { referredById: referrer.id },
  });
}
