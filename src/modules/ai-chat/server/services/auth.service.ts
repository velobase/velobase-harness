import { requireFeature } from "@/server/features/state";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { UnauthorizedError, NotFoundError } from "../../types/errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("auth-service");

export interface AuthContext {
  isGuest: boolean;
  userId?: string;
  conversationId: string;
  userAgentId?: string;
  agentId?: string;
  isOwner: boolean; // Whether user is the conversation owner
}

/**
 * Authenticate user and verify conversation access
 */
export async function authenticateAndVerifyConversation(
  conversationId: string,
  userAgentId?: string,
  agentId?: string,
): Promise<AuthContext> {
  await requireFeature("ai-chat");
  const session = await auth();
  const isGuest = !session?.user;

  // Fetch conversation
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, userId: true, isGuest: true, isShared: true },
  });

  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }

  // Verify permissions
  if (isGuest) {
    // Execution requires an editable conversation; public sharing grants read/fork only.
    if (!conversation.isGuest) {
      throw new UnauthorizedError(
        "You don't have permission to access this conversation",
      );
    }

    // Guest must provide agentId
    if (!agentId) {
      throw new UnauthorizedError("agentId required for guests");
    }

    logger.info(
      { conversationId, agentId, isShared: conversation.isShared },
      "Guest authenticated",
    );

    return {
      isGuest: true,
      conversationId,
      agentId,
      isOwner: false, // Guests are never owners
    };
  } else {
    const isOwner = conversation.userId === session.user.id;

    // Shared readers must fork before they can write.
    if (!isOwner) {
      throw new UnauthorizedError(
        "You don't have permission to access this conversation",
      );
    }

    // Logged-in user must provide userAgentId
    if (!userAgentId) {
      throw new UnauthorizedError("userAgentId required");
    }

    logger.info(
      {
        conversationId,
        userId: session.user.id,
        userAgentId,
        isOwner,
        isShared: conversation.isShared,
      },
      "User authenticated",
    );

    return {
      isGuest: false,
      userId: session.user.id,
      conversationId,
      userAgentId,
      isOwner,
    };
  }
}
