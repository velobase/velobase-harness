import {
  featureCatalog,
  type FeatureId,
  type FeatureDefinition,
} from "@velobase/module-runtime";

/** The complete example includes these capabilities. Admin cannot edit this deployment manifest.
 * The existing Harness application remains the product entry point. Package selection
 * must be implemented here and in its imports, without substituting another application.
 */
export const installedFeatures = [
  "users",
  "products",
  "payments",
  "subscriptions",
  "credits",
  "promo-codes",
  "newcomer-offers",
  "daily-bonus",
  "sharing",
  "email-management",
  "ai-support",
  "touch",
  "affiliate",
  "attribution",
  "ai-chat",
  "image-generation",
  "projects",
] as const satisfies readonly FeatureId[];

/** Preserve the complete example's established defaults. New small hosts opt in explicitly. */
export const deploymentCatalog: readonly FeatureDefinition[] =
  featureCatalog.map((feature) => ({
    ...feature,
    defaultEnabled:
      feature.id !== "email-management" && feature.id !== "ai-support",
    // The dependency belongs to this conversation adapter, not to sharing in every product.
    dependencies:
      feature.id === "sharing"
        ? ["ai-chat"]
        : feature.id === "affiliate"
          ? ["payments"]
          : feature.id === "payments"
            ? ["products"]
            : feature.dependencies,
  }));
