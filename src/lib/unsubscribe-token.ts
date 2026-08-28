import { SignJWT, jwtVerify } from "jose";
import { env } from "@/env";

const SECRET = new TextEncoder().encode(
  env.RESEND_WEBHOOK_SECRET || env.AUTH_SECRET || "fallback_secret",
);

export interface UnsubscribePayload {
  uid: string; // User ID
  act: "email_unsubscribe";
}

export async function generateUnsubscribeToken(userId: string): Promise<string> {
  return await new SignJWT({ uid: userId, act: "email_unsubscribe" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d") // 30天有效期
    .sign(SECRET);
}

export async function verifyUnsubscribeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.act !== "email_unsubscribe") return null;
    return payload.uid as string;
  } catch {
    return null;
  }
}
