import { SignJWT, jwtVerify } from "jose";
import { env } from "@/env";

function getSecret(): Uint8Array {
  const secret = env.RESEND_WEBHOOK_SECRET || env.AUTH_SECRET;
  if (!secret) {
    throw new Error("RESEND_WEBHOOK_SECRET or AUTH_SECRET is required for unsubscribe tokens");
  }
  return new TextEncoder().encode(secret);
}

export interface UnsubscribePayload {
  uid: string; // User ID
  act: "email_unsubscribe";
}

export async function generateUnsubscribeToken(userId: string): Promise<string> {
  return await new SignJWT({ uid: userId, act: "email_unsubscribe" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d") // 30天有效期
    .sign(getSecret());
}

export async function verifyUnsubscribeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.act !== "email_unsubscribe") return null;
    return payload.uid as string;
  } catch {
    return null;
  }
}
