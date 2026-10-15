import { ZodError } from "zod";
import { ChatError } from "@/types/ai-chat/errors";
import { AgentExecutionError } from "@/server/agents/registry";
import { env } from "@/env";

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    origin &&
    origin !== new URL(request.url).origin &&
    (!env.APP_URL || origin !== new URL(env.APP_URL).origin)
  )
    throw new AgentExecutionError("UNAUTHORIZED");
}
export function chatErrorResponse(error: unknown) {
  const code =
    error instanceof ZodError || error instanceof SyntaxError
      ? "BAD_REQUEST"
      : error instanceof AgentExecutionError || error instanceof ChatError
        ? error.code
        : "INTERNAL_SERVER_ERROR";
  const status =
    code === "NOT_FOUND" || code === "FEATURE_DISABLED"
      ? 404
      : code === "UNAUTHORIZED"
        ? 403
        : code.includes("LIMIT_EXCEEDED")
          ? 429
          : code === "INTERNAL_SERVER_ERROR"
            ? 500
            : 400;
  return Response.json(
    { error: code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
