import { db } from "@/server/db";
import { guestIdRateLimiter, guestIpRateLimiter } from "@/server/ratelimit";
import { getClientIp } from "@/server/lib/get-client-ip";
import {
  RateLimitExceededError,
  GuestConversationLimitExceededError,
} from "@/types/ai-chat/errors";
import { createLogger } from "@/lib/logger";
import { GUEST_MODE_CONFIG } from "@/config/guest-mode";

const logger = createLogger("rate-limit-service");

/**
 * Check guest rate limits (triple-check: guestId, IP, conversation count)
 */
export async function checkGuestRateLimits(
  req: Request,
  conversationId: string,
  guestId?: string,
): Promise<void> {
  // Check 1: guestId must be provided
  if (!guestId) {
    throw new RateLimitExceededError("Guest ID is required for guest users");
  }

  // Check 2: Guest ID rate limit (primary)
  try {
    await guestIdRateLimiter.consume(guestId);
  } catch {
    logger.warn({ guestId }, "Guest ID rate limit exceeded");
    throw new RateLimitExceededError(
      `Daily message limit (${GUEST_MODE_CONFIG.MAX_MESSAGES_PER_GUEST_ID_PER_DAY}) reached. Please sign in to continue.`,
      GUEST_MODE_CONFIG.RATE_LIMIT_WINDOW_SECONDS,
    );
  }

  // Check 3: IP rate limit (secondary)
  const clientIp = getClientIp(req);
  try {
    await guestIpRateLimiter.consume(clientIp);
  } catch {
    logger.warn({ clientIp, guestId }, "Guest IP rate limit exceeded");
    throw new RateLimitExceededError(
      "Too many requests from this IP. Please try again tomorrow.",
      GUEST_MODE_CONFIG.RATE_LIMIT_WINDOW_SECONDS,
    );
  }

  // Check 4: Database conversation message count (fallback - max replies per conversation)
  const aiMessageCount = await db.interaction.count({
    where: {
      conversationId,
      type: "ai_message",
    },
  });

  if (aiMessageCount >= GUEST_MODE_CONFIG.MAX_REPLIES_PER_CONVERSATION) {
    logger.warn(
      { conversationId, aiMessageCount },
      "Guest conversation limit reached",
    );
    throw new GuestConversationLimitExceededError(
      `You've reached the limit of ${GUEST_MODE_CONFIG.MAX_REPLIES_PER_CONVERSATION} free ${
        (GUEST_MODE_CONFIG.MAX_REPLIES_PER_CONVERSATION as number) === 1
          ? "reply"
          : "replies"
      }. Please sign in to continue.`,
    );
  }

  logger.info(
    { guestId, clientIp, conversationId },
    "Guest rate limit checks passed",
  );
}
