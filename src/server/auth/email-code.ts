import { env } from "@/env";
import { createLogger } from "@/lib/logger";
import { redis } from "@/server/redis";
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_TTL_SECONDS,
  generateEmailLoginCode,
  hashEmailLoginCode,
  normalizeEmailCodeInput,
} from "./email-code-utils";

const logger = createLogger("auth:email-code");
const KEY_PREFIX = "auth:email-code:";
const DEV_SECRET = "development-email-code-secret";

type ConsumeResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "invalid" | "too_many_attempts" };

function buildKey(email: string): string {
  return `${KEY_PREFIX}${email.toLowerCase().trim()}`;
}

function getEmailCodeSecret(): string {
  return env.AUTH_SECRET ?? DEV_SECRET;
}

export async function createEmailLoginCode(email: string): Promise<{
  code: string;
  expiresAt: number;
}> {
  const normalizedEmail = email.toLowerCase().trim();
  const code = generateEmailLoginCode();
  const expiresAt = Date.now() + EMAIL_CODE_TTL_SECONDS * 1000;

  await redis.hset(buildKey(normalizedEmail), {
    codeHash: hashEmailLoginCode({
      email: normalizedEmail,
      code,
      secret: getEmailCodeSecret(),
    }),
    attempts: "0",
    createdAt: String(Date.now()),
    expiresAt: String(expiresAt),
  });
  await redis.expire(buildKey(normalizedEmail), EMAIL_CODE_TTL_SECONDS);

  logger.info({ email: normalizedEmail }, "Created email login code");

  return { code, expiresAt };
}

const CONSUME_SCRIPT = `
local codeHash = redis.call("HGET", KEYS[1], "codeHash")
if not codeHash then
  return "expired"
end

local attempts = tonumber(redis.call("HGET", KEYS[1], "attempts") or "0")
local maxAttempts = tonumber(ARGV[2])
if attempts >= maxAttempts then
  redis.call("DEL", KEYS[1])
  return "too_many_attempts"
end

if codeHash == ARGV[1] then
  redis.call("DEL", KEYS[1])
  return "ok"
end

attempts = attempts + 1
if attempts >= maxAttempts then
  redis.call("DEL", KEYS[1])
  return "too_many_attempts"
end

redis.call("HSET", KEYS[1], "attempts", tostring(attempts))
return "invalid"
`;

export async function consumeEmailLoginCode(params: {
  email: string;
  code: string;
}): Promise<ConsumeResult> {
  const normalizedEmail = params.email.toLowerCase().trim();
  const normalizedCode = normalizeEmailCodeInput(params.code);

  if (!/^\d{6}$/.test(normalizedCode)) {
    return { ok: false, reason: "invalid" };
  }

  const candidateHash = hashEmailLoginCode({
    email: normalizedEmail,
    code: normalizedCode,
    secret: getEmailCodeSecret(),
  });

  const result = await redis.eval(
    CONSUME_SCRIPT,
    1,
    buildKey(normalizedEmail),
    candidateHash,
    String(EMAIL_CODE_MAX_ATTEMPTS),
  );

  if (result === "ok") {
    logger.info({ email: normalizedEmail }, "Consumed email login code");
    return { ok: true };
  }

  if (result === "too_many_attempts") {
    logger.warn(
      { email: normalizedEmail },
      "Email login code exceeded max attempts",
    );
    return { ok: false, reason: "too_many_attempts" };
  }

  if (result === "expired") {
    return { ok: false, reason: "expired" };
  }

  return { ok: false, reason: "invalid" };
}
