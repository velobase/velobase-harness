"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { MobileAffiliatePage } from "@/components/account/affiliate/mobile-affiliate-page";
import { DesktopAffiliatePage } from "@/components/account/affiliate/desktop-affiliate-page";
import { useIsMobile } from "@/hooks/use-mobile";
import { api } from "@/trpc/react";
import { useFeatureState } from "@/components/features/feature-gate";
import { useTranslations } from "next-intl";

export default function AffiliateRoute() {
  const feature = useFeatureState("affiliate");
  const t = useTranslations("affiliateExchange");
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/api/auth/signin?callbackUrl=%2Faccount%2Faffiliate");
    }
  }, [sessionStatus, router]);

  const { data: affiliateStatus, isLoading } = api.affiliate.getStatus.useQuery(
    undefined,
    {
      enabled: !!session,
    },
  );

  if (!mounted || sessionStatus === "loading" || isLoading) {
    return <div className="bg-background min-h-screen w-full" />;
  }

  if (!affiliateStatus?.eligible) {
    router.push("/404");
    return null;
  }

  if (isMobile) {
    return (
      <>
        {feature.resolved && !feature.enabled && (
          <p className="p-4 text-sm" role="status">
            {t("affiliateDisabled")}
          </p>
        )}
        <MobileAffiliatePage status={affiliateStatus} />
      </>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {feature.resolved && !feature.enabled && (
        <p className="text-sm" role="status">
          {t("affiliateDisabled")}
        </p>
      )}
      <DesktopAffiliatePage status={affiliateStatus} />
    </div>
  );
}
