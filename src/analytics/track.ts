import posthog from "posthog-js";

let trackingEnabled = false;
export function setTrackingEnabled(enabled: boolean) {
  trackingEnabled = enabled;
}

/**
 * 埋点追踪函数
 */
export function track(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!trackingEnabled) return;
  posthog.capture(event, properties);
}

/**
 * 用户属性设置（用于用户画像）
 */
export function setUserProperties(properties: Record<string, unknown>): void {
  if (!trackingEnabled) return;
  posthog.people.set(properties);
}

/**
 * 重置用户（登出时调用）
 */
export function resetUser(): void {
  posthog.reset();
}
