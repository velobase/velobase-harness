"use client";

import posthog from "posthog-js";
import { env } from "@/env";
import { useFeatureState } from "@/components/features/feature-gate";
import { setTrackingEnabled } from "./track";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect, type ReactNode } from "react";
import { useSession } from "next-auth/react";

let didInit = false;

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = new RegExp(
    `(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`,
  ).exec(document.cookie);
  return m ? decodeURIComponent(m[1] ?? "") : null;
}

/**
 * Initialize analytics only after both consent and the deployment feature allow it.
 * Re-read operational state for already-open browser sessions.
 *
 * 注意：LOGIN_SUCCESS 埋点在服务端 auth config 中发送，
 * 因为服务端能准确获取登录方式和 isNewUser
 */
export function PostHogProvider({
  children,
  analyticsEnabled,
}: {
  children: ReactNode;
  analyticsEnabled: boolean;
}) {
  const { data: session } = useSession();
  const attribution = useFeatureState("attribution");
  const allowed = analyticsEnabled && attribution.enabled;
  useEffect(() => {
    setTrackingEnabled(allowed);
    if (didInit) {
      if (allowed) posthog.opt_in_capturing();
      else posthog.opt_out_capturing();
    }
    const browser = window as unknown as {
      gtag?: (...args: unknown[]) => void;
    };
    if (attribution.resolved)
      browser.gtag?.("consent", "update", {
        analytics_storage: allowed ? "granted" : "denied",
        ad_storage: allowed ? "granted" : "denied",
        ad_user_data: allowed ? "granted" : "denied",
        ad_personalization: allowed ? "granted" : "denied",
      });
  }, [allowed, attribution.resolved]);

  // Initialize PostHog only when analytics is allowed (EU consent gating).
  useEffect(() => {
    if (!allowed) return;
    if (didInit) return;
    const key = env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    // Extra safety: in EEA, require explicit consent cookie even if caller passes true by mistake.
    const isEea = document.documentElement.dataset.eea === "1";
    const consent = getCookie("app_cookie_consent");
    if (isEea && consent !== "all") return;

    posthog.init(key, {
      api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
      defaults: "2025-11-30",
      person_profiles: "identified_only",
      capture_performance: {
        web_vitals: true,
        network_timing: true,
      },
    });
    didInit = true;
  }, [allowed]);

  // 用户登录后自动 identify
  useEffect(() => {
    if (allowed && didInit && session?.user?.id) {
      posthog.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
      });
    }
  }, [session?.user, allowed]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
