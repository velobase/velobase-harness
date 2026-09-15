import { TRPCError } from "@trpc/server";
import {
  featureCatalog,
  resolveFeatures,
  type FeatureId,
} from "@velobase/module-runtime";
import {
  installedFeatures,
  deploymentCatalog,
} from "@velobase/example-composition";
import { db } from "@/server/db";
import { env } from "@/env";
import { getModuleState } from "@/config/modules";
import { mailboxConfigured } from "@/server/features/connections";

const legacyModules: Partial<Record<FeatureId, string>> = {
  "ai-chat": "ai-chat",
  "image-generation": "image-generation",
  affiliate: "affiliate",
  touch: "touch",
};

/** No process-local cache: requests and workers see the same persisted switch. */
export async function getFeatureStates() {
  const settings = await db.featureSetting.findMany();
  const switches: Record<string, boolean> = Object.fromEntries(
    settings.map((row) => [row.id, row.enabled]),
  );
  const configuration: Record<string, string[]> = {};
  if (!env.VELOBASE_API_KEY) configuration.credits = ["VELOBASE_API_KEY"];
  if (!env.RESEND_API_KEY && !env.SENDGRID_API_KEY)
    configuration.touch = ["RESEND_API_KEY / SENDGRID_API_KEY"];
  for (const [id, legacy] of Object.entries(legacyModules)) {
    const state = getModuleState(legacy);
    if (!state?.enabled)
      configuration[id] =
        state?.mode === "off"
          ? [state.modeEnv]
          : state?.missingEnv.length
            ? state.missingEnv
            : [legacy];
  }
  const legacySupport = Boolean(
    getModuleState("support-automation")?.enabled &&
    env.SUPPORT_EMAIL_ADDRESS &&
    env.SUPPORT_EMAIL_PASSWORD &&
    env.SUPPORT_IMAP_HOST &&
    env.SUPPORT_SMTP_HOST,
  );
  switches["email-management"] ??= legacySupport;
  switches["ai-support"] ??= legacySupport;
  if (env.EMAIL_MANAGEMENT_MODE === "off")
    configuration["email-management"] = ["EMAIL_MANAGEMENT_MODE"];
  if (!(await mailboxConfigured()))
    configuration["email-management"] = ["mailbox"];
  if (!env.OPENROUTER_API_KEY || env.SUPPORT_AUTOMATION_MODE === "off")
    configuration["ai-support"] = [
      "OPENROUTER_API_KEY / SUPPORT_AUTOMATION_MODE",
    ];
  if (
    !["stripe", "lemonsqueezy", "nowpayments"].some(
      (id) => getModuleState(id)?.enabled,
    )
  )
    configuration.payments = ["payment"];
  return resolveFeatures({
    catalog: deploymentCatalog,
    installed: installedFeatures,
    switches,
    configuration,
  });
}

export async function isFeatureEnabled(id: FeatureId): Promise<boolean> {
  return (await getFeatureStates()).some(
    (feature) => feature.id === id && feature.enabled,
  );
}

export async function requireFeature(id: FeatureId): Promise<void> {
  if (!(await isFeatureEnabled(id)))
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Feature unavailable: ${id}`,
    });
}

export async function setFeatureEnabled(
  id: string,
  enabled: boolean,
  userId: string,
) {
  const state = (await getFeatureStates()).find((feature) => feature.id === id);
  if (!state?.installed || state.category === "foundation")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This feature cannot be switched in this deployment",
    });
  if (enabled && state.missing.length)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Configure or enable: ${state.missing.join(", ")}`,
    });
  await db.featureSetting.upsert({
    where: { id },
    create: { id, enabled, updatedBy: userId },
    update: { enabled, updatedBy: userId },
  });
  return getFeatureStates();
}

export function isFeatureId(id: string): id is FeatureId {
  return featureCatalog.some((feature) => feature.id === id);
}

export function requireIncludedFeature(id: FeatureId) {
  if (!(installedFeatures as readonly string[]).includes(id))
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Feature not included: ${id}`,
    });
}
