import { acceptChat } from "@/server/ai-chat/admission";
import { chatRequestSchema } from "@/server/ai-chat/input";
import { chatErrorResponse, requireSameOrigin } from "@/server/ai-chat/http";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = chatRequestSchema.parse(await request.json());
    return Response.json(await acceptChat(input, request), { status: 202 });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
