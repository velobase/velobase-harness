import { protectedProcedure } from "@/server/api/trpc";
import { GetBalanceInputSchema, GetBalanceOutputSchema } from "../../schemas";
import { getBalance } from "../../services/get-balance";

export const getBalanceProcedure = protectedProcedure
  .input(GetBalanceInputSchema)
  .output(GetBalanceOutputSchema)
  .query(async ({ input, ctx }) => {
    return getBalance({
      ...input,
      userId: input.userId === "__self__" ? ctx.session.user.id : input.userId,
    });
  });

