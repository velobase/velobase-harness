import { listSharesInput, shareInput } from "@velobase/sharing";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import {
  conversationSharing,
  sharingOperation,
} from "@/server/sharing/service";

/** Keep moderation available after disabling publication. */
export const sharingAdminRouter = createTRPCRouter({
  list: adminProcedure
    .input(listSharesInput)
    .query(({ input }) => conversationSharing.listForAdmin(input)),
  revoke: adminProcedure.input(shareInput).mutation(async ({ input }) => {
    await sharingOperation(() => conversationSharing.revokeAsAdmin(input));
    return { success: true };
  }),
});
