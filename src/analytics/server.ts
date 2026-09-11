import { env } from "@/env";
import { PostHog } from "posthog-node";

/**
 * 服务端 PostHog 客户端
 * 用于 Server Components / API Routes / Server Actions
 * 当 API key 不存在时返回 null
 */
export function getServerPostHog(): PostHog | null {
  const apiKey = env.POSTHOG_API_KEY ?? env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) {
    return null;
  }
  return new PostHog(apiKey, {
    host: env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
}

/**
 * 安全的 track 方法，不会因为 PostHog 问题而阻塞业务逻辑
 */
export async function safeTrack(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  try {
    const { isFeatureEnabled } = await import("@/server/features/state");
    if (!(await isFeatureEnabled("attribution"))) return;
    const posthog = getServerPostHog();
    if (!posthog) return;
    posthog.capture({ distinctId, event, properties });
    await posthog.shutdown();
  } catch {
    // 静默失败，不阻塞业务逻辑
  }
}
