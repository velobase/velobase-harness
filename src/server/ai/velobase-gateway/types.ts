export const VELOBASE_GATEWAY_PROVIDER_ID = "velobase-gateway" as const;

export type VelobaseGatewayProviderId = typeof VELOBASE_GATEWAY_PROVIDER_ID;

export type VelobaseGatewayKeyKind = "project" | "customer" | "unknown";

export type VelobaseGatewayBillingHeaders = {
  costCents?: string;
  costCredits?: string;
  balanceCredits?: string;
  transactionId?: string;
};

export type VelobaseGatewayModel = {
  id: string;
  object?: string;
  created?: number;
  ownedBy?: string;
  providerRaw?: unknown;
};

export type VelobaseGatewayUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type VelobaseGatewayChatTestInput = {
  customerId?: string;
  model?: string;
  prompt: string;
  maxTokens?: number;
};

export type VelobaseGatewayChatTestResult = {
  ok: true;
  model: string;
  customerId?: string;
  message: string;
  usage: VelobaseGatewayUsage;
  billing: VelobaseGatewayBillingHeaders;
  checkedAt: string;
};

export class VelobaseGatewayError extends Error {
  constructor(
    message: string,
    public readonly details: {
      httpStatus?: number;
      code?: string | number;
      retryable?: boolean;
      providerRaw?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "VelobaseGatewayError";
  }
}
