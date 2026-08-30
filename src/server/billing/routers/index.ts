import { createTRPCRouter } from "@/server/api/trpc";
import { getBalanceProcedure } from "./procedures/get-balance";
import { getRecordsProcedure } from "./procedures/get-records";

export const billingRouter = createTRPCRouter({
  getBalance: getBalanceProcedure,
  getRecords: getRecordsProcedure,
});
