import { protectedProcedure } from "@/server/api/trpc";
import { getOrderSchema } from "../../schemas/order";
import {
  paymentRecords,
  paymentOperation,
} from "@/modules/payments/server/service";

export const getOrderProcedure = protectedProcedure
  .input(getOrderSchema)
  .query(({ ctx, input }) =>
    paymentOperation(() =>
      paymentRecords.getOrder(ctx.session.user.id, input.orderId),
    ),
  );
