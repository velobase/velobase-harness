import type { HealthResponse } from "@velobase/contracts";

export const HEALTH_CHANNEL = "velobase:health";
export type DesktopBridge = Readonly<{ getHealth(): Promise<HealthResponse> }>;
