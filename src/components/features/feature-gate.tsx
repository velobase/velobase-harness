"use client";
import type { ReactNode } from "react";
import type { FeatureId } from "@velobase/module-runtime";
import { api } from "@/trpc/react";
export function useFeatureState(id: FeatureId) {
  const state = api.features.publicState.useQuery(undefined, {
    refetchInterval: 15000,
  });
  return {
    enabled: state.data?.includes(id) ?? false,
    resolved: state.data !== undefined,
  };
}
export function useFeature(id: FeatureId) {
  return useFeatureState(id).enabled;
}
export function FeatureGate({
  feature,
  children,
}: {
  feature: FeatureId;
  children: ReactNode;
}) {
  return useFeature(feature) ? children : null;
}
