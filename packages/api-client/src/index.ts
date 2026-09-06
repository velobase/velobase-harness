import { healthResponseSchema, type HealthResponse } from "@velobase/contracts";

/** The host owns networking, cancellation and credentials. No platform globals. */
export type ApiTransport = (path: string) => Promise<{
  status: number;
  body: unknown;
}>;

export class ApiClientError extends Error {
  constructor(
    public readonly kind: "network" | "http" | "invalid_response",
    public readonly status?: number,
  ) {
    super(`API request failed: ${kind}`);
    this.name = "ApiClientError";
  }
}

export function createApiClient(
  transport: ApiTransport,
  options: { healthPath?: "/health" | "/api/health" } = {},
) {
  return Object.freeze({
    async getHealth(): Promise<HealthResponse> {
      let response: Awaited<ReturnType<ApiTransport>>;
      try {
        response = await transport(options.healthPath ?? "/api/health");
      } catch {
        throw new ApiClientError("network");
      }
      if (response.status !== 200)
        throw new ApiClientError("http", response.status);
      const parsed = healthResponseSchema.safeParse(response.body);
      if (!parsed.success) throw new ApiClientError("invalid_response");
      return parsed.data;
    },
  });
}
