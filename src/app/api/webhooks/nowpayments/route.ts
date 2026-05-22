import { MODULES } from "@/config/modules";
import { handleWebhookRoute } from "@/server/order/services/webhook-route-handler";

export async function POST(req: Request) {
  if (!MODULES.integrations.payment.nowpayments.enabled) {
    return new Response(null, { status: 404 });
  }
  return handleWebhookRoute("NOWPAYMENTS", req);
}
