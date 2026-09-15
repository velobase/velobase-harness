/** Metadata is safe to render without importing any module implementation or SDK. */
export interface FeatureDefinition {
  id: string;
  category: "foundation" | "business";
  dependencies: readonly string[];
  defaultEnabled: boolean;
  href?: string;
  connection?: string;
}

export const featureCatalog = [
  {
    id: "users",
    category: "foundation",
    dependencies: [],
    defaultEnabled: true,
    href: "/admin/users",
  },
  {
    id: "products",
    category: "business",
    dependencies: [],
    defaultEnabled: false,
    href: "/admin/products",
  },
  {
    id: "payments",
    category: "business",
    dependencies: [],
    defaultEnabled: false,
    href: "/admin/orders",
    connection: "payment",
  },
  {
    id: "subscriptions",
    category: "business",
    dependencies: ["payments"],
    defaultEnabled: false,
  },
  {
    id: "credits",
    connection: "ledger",
    category: "business",
    dependencies: [],
    defaultEnabled: false,
    href: "/admin/credits",
  },
  {
    id: "promo-codes",
    category: "business",
    dependencies: ["credits"],
    defaultEnabled: false,
    href: "/admin/promo-codes",
  },
  {
    id: "newcomer-offers",
    category: "business",
    dependencies: ["payments"],
    defaultEnabled: false,
  },
  {
    id: "daily-bonus",
    category: "business",
    dependencies: ["credits"],
    defaultEnabled: false,
  },
  {
    id: "sharing",
    category: "business",
    dependencies: [],
    defaultEnabled: false,
  },
  {
    id: "email-management",
    category: "business",
    dependencies: [],
    defaultEnabled: false,
    href: "/admin/email",
    connection: "mailbox",
  },
  {
    id: "ai-support",
    category: "business",
    dependencies: ["email-management"],
    defaultEnabled: false,
    href: "/admin/email",
    connection: "ai",
  },
  {
    id: "touch",
    category: "business",
    dependencies: [],
    defaultEnabled: false,
    href: "/admin/touches",
    connection: "email",
  },
  {
    id: "affiliate",
    category: "business",
    dependencies: [],
    defaultEnabled: false,
    href: "/admin/affiliate/commissions",
  },
  {
    id: "attribution",
    category: "business",
    dependencies: [],
    defaultEnabled: false,
    connection: "analytics",
  },
  {
    id: "ai-chat",
    category: "business",
    dependencies: [],
    defaultEnabled: false,
    href: "/admin/dialogs",
    connection: "ai",
  },
  {
    id: "image-generation",
    category: "business",
    dependencies: [],
    defaultEnabled: false,
    connection: "images",
  },
  {
    id: "projects",
    category: "business",
    dependencies: [],
    defaultEnabled: false,
  },
] as const satisfies readonly FeatureDefinition[];

export type FeatureId = (typeof featureCatalog)[number]["id"];
export type FeatureStatus =
  | "absent"
  | "unconfigured"
  | "disabled"
  | "blocked"
  | "enabled";
export interface FeatureState extends FeatureDefinition {
  installed: boolean;
  requested: boolean;
  enabled: boolean;
  status: FeatureStatus;
  missing: string[];
}

/** Resolve the full graph, including transitive dependencies. Never enable dependencies implicitly. */
export function resolveFeatures(options: {
  catalog?: readonly FeatureDefinition[];
  installed: readonly string[];
  switches: Readonly<Record<string, boolean | undefined>>;
  configuration: Readonly<Record<string, readonly string[] | undefined>>;
}): FeatureState[] {
  const catalog = options.catalog ?? featureCatalog;
  const definitions = new Map(catalog.map((entry) => [entry.id, entry]));
  if (definitions.size !== catalog.length)
    throw new Error("Duplicate feature id");
  const installed = new Set(options.installed);
  const resolved = new Map<string, FeatureState>();
  const resolving = new Set<string>();
  const visit = (id: string): FeatureState => {
    const cached = resolved.get(id);
    if (cached) return cached;
    const definition = definitions.get(id);
    if (!definition) throw new Error(`Unknown feature: ${id}`);
    if (resolving.has(id))
      throw new Error(`Circular feature dependency: ${id}`);
    resolving.add(id);
    const requested =
      definition.category === "foundation" ||
      (options.switches[id] ?? definition.defaultEnabled);
    const missingConfig = [...(options.configuration[id] ?? [])];
    const missingDependencies = definition.dependencies.filter(
      (dep) => !visit(dep).enabled,
    );
    const status: FeatureStatus = !installed.has(id)
      ? "absent"
      : missingConfig.length
        ? "unconfigured"
        : !requested
          ? "disabled"
          : missingDependencies.length
            ? "blocked"
            : "enabled";
    const state: FeatureState = {
      ...definition,
      installed: installed.has(id),
      requested,
      enabled: status === "enabled",
      status,
      missing: [...missingConfig, ...missingDependencies],
    };
    resolving.delete(id);
    resolved.set(id, state);
    return state;
  };
  for (const id of installed)
    if (!definitions.has(id))
      throw new Error(`Unknown installed feature: ${id}`);
  return catalog.map((entry) => visit(entry.id));
}
