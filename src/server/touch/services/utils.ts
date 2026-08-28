import type { TouchReferenceType } from "../types";
import { env } from "@/env";

export function getAppBaseUrl(): string {
  const fromEnv =
    env.APP_URL || process.env.VERCEL_URL;

  if (fromEnv) {
    // VERCEL_URL may be host without scheme
    if (fromEnv.startsWith("http://") || fromEnv.startsWith("https://")) {
      return fromEnv.replace(/\/$/, "");
    }
    return `https://${fromEnv}`.replace(/\/$/, "");
  }

  return "https://example.com";
}

export function buildManageSubscriptionUrl(): string {
  // Direct users to an authenticated route that redirects into Stripe Customer Portal.
  // (If the user isn't logged in, they'll be sent to login first.)
  return `${getAppBaseUrl()}/account/manage-subscription`;
}

export function computeD1ScheduledAt(expiresAt: Date): Date {
  return new Date(expiresAt.getTime() - 24 * 60 * 60_000);
}

export function buildTouchDedupeKey(params: {
  channel: "EMAIL";
  sceneKey: string;
  referenceType: TouchReferenceType;
  referenceId: string;
}): string {
  const { channel, sceneKey, referenceType, referenceId } = params;
  return `${channel}:${sceneKey}:${referenceType}:${referenceId}`;
}

export function normalizeReferenceType(value: string): TouchReferenceType | null {
  return value === "SUBSCRIPTION_CYCLE" ? "SUBSCRIPTION_CYCLE" : null;
}

