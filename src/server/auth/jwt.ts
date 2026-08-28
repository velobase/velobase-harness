import { env } from "@/env";
import { SignJWT } from "jose";

/**
 * Generate a JWT token for MCP authentication
 * This creates a short-lived JWS (signed) token containing the userId
 * Compatible with jose.jwtVerify() in MCP worker
 */
export async function generateMcpToken(userId: string): Promise<string> {
  const sourceSecret = env.AUTH_SECRET;
  if (!sourceSecret) {
    throw new Error("AUTH_SECRET is not configured");
  }
  const secret = new TextEncoder().encode(sourceSecret);

  const token = await new SignJWT({ sub: userId, userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h") // 1 hour expiration
    .sign(secret);

  return token;
}
