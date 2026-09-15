"use client";

import { useFeature } from "@/components/features/feature-gate";
import { MobileAffiliateLanding } from "./mobile-affiliate-landing";
import {
  MobileAffiliateDashboard,
  type AffiliateStatus,
} from "./mobile-affiliate-dashboard";

interface Props {
  status: AffiliateStatus;
}

export function MobileAffiliatePage({ status }: Props) {
  const enrollmentEnabled = useFeature("affiliate");
  const isPartner = !!status.referralCode;

  if (isPartner || !status.canActivate || !enrollmentEnabled) {
    return <MobileAffiliateDashboard status={status} />;
  }

  return <MobileAffiliateLanding />;
}
