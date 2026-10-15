import { db } from "@/server/db";
import { InteractionType } from "@/types/ai-chat/interaction";

export async function loadUIInteractions(conversationId: string) {
  return db.interaction.findMany({
    where: {
      conversationId,
      type: {
        in: [InteractionType.USER_MESSAGE, InteractionType.AI_MESSAGE],
      },
    },
    orderBy: { createdAt: "asc" },
  });
}
