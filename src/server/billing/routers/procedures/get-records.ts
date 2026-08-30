import { protectedProcedure } from "@/server/api/trpc";
import { GetRecordsInputSchema, GetRecordsOutputSchema } from "../../schemas";
import { getRecords } from "../../services/get-records";

export const getRecordsProcedure = protectedProcedure
  .input(GetRecordsInputSchema)
  .output(GetRecordsOutputSchema)
  .query(async ({ input, ctx }) => {
    return getRecords({
      ...input,
      userId: ctx.session.user.id,
    });
  });
