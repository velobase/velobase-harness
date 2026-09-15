import type { FrameworkModule } from "@/server/modules/registry";
import type {
  SchedulerContribution,
  WorkerContribution,
} from "@/workers/types";

export const MODULE_MODES = ["off", "auto", "on"] as const;

export type ModuleMode = (typeof MODULE_MODES)[number];
export type ModuleKind = "feature" | "integration" | "platform";
export type ModuleId = string;

export type EnvReader = Record<string, string | undefined>;

export type ModuleConfigRequirement =
  | string
  | {
      anyOf: string[];
      name?: string;
    }
  | {
      allOf: string[];
      name?: string;
    };

export type ModuleDependencyRequirement =
  | ModuleId
  | {
      anyOf: ModuleId[];
      name?: string;
    }
  | {
      allOf: ModuleId[];
      name?: string;
    };

export interface ModuleDefinition {
  id: ModuleId;
  kind: ModuleKind;
  label: string;
  modeEnv: string;
  defaultMode?: ModuleMode;
  config?: ModuleConfigRequirement[];
  dependencies?: ModuleDependencyRequirement[];
  loadFrameworkModule?: () => Promise<FrameworkModule>;
  /** Keep reversal handlers for deployed business data when new operations are off. */
  retainEventHandlersWhenDisabled?: boolean;
  loadWorkerContributions?: () => Promise<WorkerContribution[]>;
  /** Cleanup must not import disabled processors or their SDKs. */
  loadDisabledSchedulers?: () => Promise<SchedulerContribution[]>;
}

export interface ModuleState {
  id: ModuleId;
  kind: ModuleKind;
  label: string;
  modeEnv: string;
  mode: ModuleMode;
  enabled: boolean;
  configured: boolean;
  missingEnv: string[];
  missingDependencies: string[];
  reason: "mode_off" | "enabled" | "missing_config" | "missing_dependency";
  error?: string;
}

export interface ResolveModuleStateOptions {
  throwOnForcedMisconfiguration?: boolean;
}

export class ModuleStateError extends Error {
  constructor(public readonly states: ModuleState[]) {
    const errors = states
      .filter((state) => state.error)
      .map((state) => `${state.id}: ${state.error}`)
      .join("; ");
    super(`Module configuration error: ${errors}`);
    this.name = "ModuleStateError";
  }
}

export function parseModuleMode(
  value: string | undefined,
  defaultMode: ModuleMode = "auto",
): ModuleMode {
  if (!value) return defaultMode;

  const normalized = value.trim().toLowerCase();
  if (MODULE_MODES.includes(normalized as ModuleMode)) {
    return normalized as ModuleMode;
  }

  throw new Error(
    `Invalid module mode "${value}". Expected one of: ${MODULE_MODES.join(", ")}`,
  );
}

export function resolveModuleStates(
  definitions: readonly ModuleDefinition[],
  env: EnvReader,
  options: ResolveModuleStateOptions = {},
): ModuleState[] {
  const throwOnForcedMisconfiguration =
    options.throwOnForcedMisconfiguration ?? true;

  const initialStates = definitions.map((definition) => {
    const mode = parseModuleMode(
      env[definition.modeEnv],
      definition.defaultMode ?? "auto",
    );
    const missingEnv =
      mode === "off" ? [] : getMissingEnv(definition.config ?? [], env);
    const configured = missingEnv.length === 0;
    return {
      id: definition.id,
      kind: definition.kind,
      label: definition.label,
      modeEnv: definition.modeEnv,
      mode,
      enabled: mode !== "off" && configured,
      configured,
      missingEnv,
      missingDependencies: [] as string[],
      reason: getInitialReason(mode, configured),
    } satisfies ModuleState;
  });

  const stateById = new Map(initialStates.map((state) => [state.id, state]));
  const definitionById = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  if (definitionById.size !== definitions.length)
    throw new Error("Duplicate module id");
  const resolvedById = new Map<ModuleId, ModuleState>();
  const visiting = new Set<ModuleId>();
  const resolve = (id: ModuleId): ModuleState => {
    const cached = resolvedById.get(id);
    if (cached) return cached;
    if (visiting.has(id)) throw new Error(`Circular module dependency: ${id}`);
    const state = stateById.get(id);
    if (!state) throw new Error(`Unknown module: ${id}`);
    visiting.add(id);
    const requirements = definitionById.get(id)?.dependencies ?? [];
    const dependencies = requirements.flatMap((entry) =>
      typeof entry === "string"
        ? [entry]
        : "anyOf" in entry
          ? entry.anyOf
          : entry.allOf,
    );
    for (const dependency of dependencies) {
      if (stateById.has(dependency))
        stateById.set(dependency, resolve(dependency));
    }
    const missingDependencies = getMissingDependencies(requirements, stateById);
    const result: ModuleState =
      state.mode === "off" || !state.configured || !missingDependencies.length
        ? state
        : {
            ...state,
            enabled: false,
            missingDependencies,
            reason: "missing_dependency",
          };
    visiting.delete(id);
    resolvedById.set(id, result);
    stateById.set(id, result);
    return result;
  };
  const states = initialStates.map((state) => resolve(state.id));

  const resolved: ModuleState[] = states.map((state): ModuleState => {
    if (state.mode !== "on" || state.enabled) return state;

    const missingParts = [
      state.missingEnv.length > 0
        ? `missing env: ${state.missingEnv.join(", ")}`
        : null,
      state.missingDependencies.length > 0
        ? `missing dependency: ${state.missingDependencies.join(", ")}`
        : null,
    ].filter(Boolean);

    return {
      ...state,
      error: `${state.modeEnv}=on but ${missingParts.join("; ")}`,
    } satisfies ModuleState;
  });

  if (throwOnForcedMisconfiguration && resolved.some((state) => state.error)) {
    throw new ModuleStateError(resolved);
  }

  return resolved;
}

function getInitialReason(
  mode: ModuleMode,
  configured: boolean,
): ModuleState["reason"] {
  if (mode === "off") return "mode_off";
  if (!configured) return "missing_config";
  return "enabled";
}

function getMissingEnv(
  requirements: readonly ModuleConfigRequirement[],
  env: EnvReader,
): string[] {
  return requirements.flatMap((requirement) => {
    if (typeof requirement === "string") {
      return hasEnv(env, requirement) ? [] : [requirement];
    }

    if ("anyOf" in requirement) {
      return requirement.anyOf.some((key) => hasEnv(env, key))
        ? []
        : [requirement.name ?? requirement.anyOf.join("|")];
    }

    return requirement.allOf.filter((key) => !hasEnv(env, key));
  });
}

function getMissingDependencies(
  requirements: readonly ModuleDependencyRequirement[],
  states: ReadonlyMap<ModuleId, ModuleState>,
): string[] {
  return requirements.flatMap((requirement) => {
    if (typeof requirement === "string") {
      return states.get(requirement)?.enabled ? [] : [requirement];
    }

    if ("anyOf" in requirement) {
      return requirement.anyOf.some((id) => states.get(id)?.enabled)
        ? []
        : [requirement.name ?? requirement.anyOf.join("|")];
    }

    return requirement.allOf.filter((id) => !states.get(id)?.enabled);
  });
}

function hasEnv(env: EnvReader, key: string): boolean {
  const value = env[key];
  return value !== undefined && value.trim() !== "";
}
