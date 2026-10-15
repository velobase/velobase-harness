import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { env } from "@/env";
import { AgentExecutionError } from "@/server/agents/registry";

const GUEST_COOKIE = "harness_chat_guest";
export async function guestOwnerHash(
  create = false,
): Promise<string | undefined> {
  const jar = await cookies();
  let token = jar.get(GUEST_COOKIE)?.value;
  if ((!token || !/^[a-f0-9]{64}$/.test(token)) && create) {
    token = randomBytes(32).toString("hex");
    jar.set(GUEST_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return token && /^[a-f0-9]{64}$/.test(token)
    ? createHash("sha256").update(token).digest("hex")
    : undefined;
}

/** HTTP adapter only. Worker authorization never imports cookies or auth(). */
export async function requireChatOwner(conversationId: string) {
  const [session, guestHash, conversation] = await Promise.all([
    auth(),
    guestOwnerHash(),
    db.conversation.findUnique({ where: { id: conversationId } }),
  ]);
  if (!conversation) throw new AgentExecutionError("NOT_FOUND");
  if (
    conversation.isGuest &&
    guestHash &&
    conversation.guestOwnerHash === guestHash
  ) {
    return {
      conversation,
      guestHash,
      userId: undefined,
      actorKey: `guest:${guestHash}`,
    };
  }
  const userId = session?.user?.id;
  if (!userId || conversation.userId !== userId)
    throw new AgentExecutionError("NOT_FOUND");
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isBlocked: true },
  });
  if (!user || user.isBlocked) throw new AgentExecutionError("UNAUTHORIZED");
  return {
    conversation,
    userId,
    guestHash: undefined,
    actorKey: `user:${userId}`,
  };
}
