import { createSharing, SharingError } from "@velobase/sharing";
import { TRPCError } from "@trpc/server";
import { db } from "@/server/db";
import { isFeatureEnabled } from "@/server/features/state";

type SharedConversation = {
  id: string;
  isShared: boolean;
  title: string | null;
  sharedAt: Date | null;
  user: { email: string | null } | null;
};
export const conversationSharing = createSharing<SharedConversation>({
  isEnabled: () => isFeatureEnabled("sharing"),
  repository: {
    async setPublication(id, ownerId, sharedAt) {
      const result = await db.conversation.updateMany({
        where: { id, ...(ownerId === undefined ? {} : { userId: ownerId }) },
        data: { isShared: sharedAt !== null, sharedAt },
      });
      return result.count > 0;
    },
    async listPublished({ cursor, limit }) {
      const rows = await db.conversation.findMany({
        where: { isShared: true },
        select: {
          id: true,
          isShared: true,
          title: true,
          sharedAt: true,
          user: { select: { email: true } },
        },
        orderBy: { id: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const items = rows.slice(0, limit);
      return {
        items,
        nextCursor: rows.length > limit ? items.at(-1)?.id : undefined,
      };
    },
  },
});
export async function sharingOperation<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SharingError)
      throw new TRPCError({ code: "NOT_FOUND", message: error.message });
    throw error;
  }
}
