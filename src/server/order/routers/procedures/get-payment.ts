import { protectedProcedure } from "@/server/api/trpc";
import { getPaymentSchema } from "../../schemas/payment";
import { getPayment } from "../../services/get-payment";
import {
  paymentRecords,
  paymentOperation,
} from "@/modules/payments/server/service";

export const getPaymentProcedure = protectedProcedure
  .input(getPaymentSchema)
  .query(async ({ ctx, input }) => {
    // Authorize before the legacy provider refresh, which can settle an already-paid order.
    await paymentOperation(() =>
      paymentRecords.getPayment(ctx.session.user.id, input.paymentId),
    );
    return getPayment(input.paymentId);
  });
