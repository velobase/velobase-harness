import { createApiClient } from "@velobase/api-client";

export const webApi = createApiClient(async (path) => {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "omit",
    signal: AbortSignal.timeout(10_000),
  });
  return { status: response.status, body: (await response.json()) as unknown };
});
