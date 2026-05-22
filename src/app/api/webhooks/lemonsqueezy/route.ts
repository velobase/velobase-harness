import { handleWebhookRoute } from "@/server/order/services/webhook-route-handler";

export async function POST(req: Request) {
  const signature = req.headers.get("x-signature");
  if (!signature) {
    return new Response(JSON.stringify({ ok: false, error: "Missing x-signature" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  return handleWebhookRoute("LEMONSQUEEZY", req);
}
