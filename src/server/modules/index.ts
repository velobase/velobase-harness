import type { FeatureId } from "@velobase/module-runtime";
import { isFeatureEnabled } from "@/server/features/state";
import { getEventModuleDefinitions } from "@/config/modules";
import { appEvents } from "@/server/events/bus";
import type { FrameworkModule } from "@/server/modules/registry";
import { createLogger } from "@/lib/logger";

const log = createLogger("modules");

let activeModules: FrameworkModule[] = [];
let scopedBuses: Array<ReturnType<typeof appEvents.scope>> = [];
const eventFeature: Record<string, FeatureId | undefined> = {
  affiliate: "affiliate",
  touch: "touch",
  posthog: "attribution",
  "google-ads": "attribution",
  "ai-chat": "ai-chat",
  "image-generation": "image-generation",
};

export async function initModules(): Promise<FrameworkModule[]> {
  for (const bus of scopedBuses) bus.clear();
  scopedBuses = [];
  const modules: FrameworkModule[] = [];
  const definitions = getEventModuleDefinitions();

  for (const definition of definitions) {
    const frameworkModule = await definition.loadFrameworkModule?.();
    if (frameworkModule) {
      modules.push(frameworkModule);
    }
  }

  for (const mod of modules) {
    const feature = eventFeature[mod.name];
    const bus = appEvents.scope(async (event) => {
      // Reversals and cancellation must settle previous business, even after a switch is off.
      if (
        event === "payment:refunded" ||
        event === "invoice:refunded" ||
        event === "subscription:canceled"
      )
        return true;
      return !feature || (await isFeatureEnabled(feature));
    });
    scopedBuses.push(bus);
    mod.registerEventHandlers?.(bus);
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
