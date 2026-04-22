import { MODULES } from "@/config/modules";
import { appEvents } from "@/server/events/bus";
import type { FrameworkModule } from "@/server/modules/registry";
import { createLogger } from "@/lib/logger";

const log = createLogger("modules");

let activeModules: FrameworkModule[] = [];

export async function initModules(): Promise<FrameworkModule[]> {
  const modules: FrameworkModule[] = [];

  if (MODULES.integrations.analytics.googleAds.enabled) {
    const { googleAdsModule } = await import("@/server/modules/google-ads");
    modules.push(googleAdsModule);
  }

  if (MODULES.integrations.analytics.posthog.enabled) {
    const { posthogModule } = await import("@/server/modules/posthog");
    modules.push(posthogModule);
  }

  if (MODULES.integrations.messaging.lark.enabled) {
    const { larkModule } = await import("@/server/modules/lark");
    modules.push(larkModule);
  }

  if (MODULES.features.affiliate.enabled) {
    const { affiliateModule } = await import("@/server/modules/affiliate");
    modules.push(affiliateModule);
  }

  if (MODULES.features.touch.enabled) {
    const { touchModule } = await import("@/server/modules/touch");
    modules.push(touchModule);
  }

  if (MODULES.integrations.messaging.telegram.enabled) {
    const { telegramModule } = await import("@/server/modules/telegram");
    modules.push(telegramModule);
  }

  if (MODULES.integrations.payment.nowpayments.enabled) {
    const { nowpaymentsModule } = await import("@/server/modules/nowpayments");
    modules.push(nowpaymentsModule);
  }

  if (MODULES.features.aiChat.enabled) {
    const { aiChatModule } = await import("@/server/modules/ai-chat");
    modules.push(aiChatModule);
  }

  for (const mod of modules) {
    mod.registerEventHandlers?.(appEvents);
    await mod.onInit?.();
    log.info({ module: mod.name }, "Module initialized");
  }

  activeModules = modules;
  log.info(
    { modules: modules.map((m) => m.name) },
    `Initialized ${modules.length} modules`,
  );

  return modules;
}

export function getActiveModules(): FrameworkModule[] {
  return activeModules;
}
